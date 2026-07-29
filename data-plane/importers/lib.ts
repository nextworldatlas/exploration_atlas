// Shared importer plumbing. All importers are idempotent and keyed on stable
// external ids (guardrail): re-running updates in place, never duplicates.
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { insertPlaceClosure } from "../../src/lib/closure";
import { validateAttrs, type SystemManifest } from "../../src/lib/manifest";

type Queryable = Pick<Pool | PoolClient, "query">;

export const CACHE_DIR = path.resolve(import.meta.dirname, "..", ".cache");

// Download with an on-disk cache so re-runs are offline-friendly.
export async function download(url: string, filename: string): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const dest = path.join(CACHE_DIR, filename);
  if (existsSync(dest)) {
    console.log(`cache  ${filename}`);
    return dest;
  }
  console.log(`fetch  ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  return dest;
}

export interface PlaceInput {
  kind: string;
  slug: string;
  name: string;
  externalIds: Record<string, string>;
  parentId?: number | null;
  geojson?: object | null; // geometry object, EPSG:4326
  attrs?: Record<string, unknown>;
}

// Upsert keyed on (kind, external_ids ⊇ key): the first external-id pair is
// the identity key. Geometry is validated and centroid/bbox derived in SQL.
export async function upsertPlace(db: Queryable, p: PlaceInput): Promise<number> {
  const [idKey, idVal] = Object.entries(p.externalIds)[0]!;
  const keyJson = JSON.stringify({ [idKey]: idVal });
  const geomSql = p.geojson
    ? `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))))`
    : "NULL";

  const existing = await db.query(
    `SELECT id FROM places WHERE kind = $1 AND external_ids @> $2::jsonb`,
    [p.kind, keyJson]
  );

  const params: unknown[] = [
    p.kind,
    p.slug,
    p.name,
    JSON.stringify(p.externalIds),
    p.parentId ?? null,
  ];
  if (p.geojson) params.push(JSON.stringify(p.geojson));
  params.push(JSON.stringify(p.attrs ?? {}));
  const attrsIdx = params.length;

  let id: number;
  if (existing.rows[0]) {
    id = existing.rows[0].id;
    await db.query(
      `UPDATE places SET
         slug = $2, name = $3,
         external_ids = external_ids || $4::jsonb,
         parent_id = $5,
         ${p.geojson ? `geom = ${geomSql}, centroid = ST_Centroid(${geomSql}), bbox = ST_Envelope(${geomSql}),` : ""}
         attrs = attrs || $${attrsIdx}::jsonb
       WHERE id = $1`,
      [id, ...params.slice(1)]
    );
  } else {
    const res = await db.query(
      `INSERT INTO places (kind, slug, name, external_ids, parent_id, geom, centroid, bbox, attrs)
       VALUES ($1, $2, $3, $4::jsonb, $5,
         ${p.geojson ? geomSql : "NULL"},
         ${p.geojson ? `ST_Centroid(${geomSql})` : "NULL"},
         ${p.geojson ? `ST_Envelope(${geomSql})` : "NULL"},
         $${attrsIdx}::jsonb)
       RETURNING id`,
      params
    );
    id = res.rows[0].id;
  }
  await insertPlaceClosure(db, id, p.parentId ?? null);
  return id;
}

export interface ComponentInput {
  systemId: number;
  placeId: number;
  containerComponentId?: number | null;
  role?: "leaf" | "container";
  weight?: number;
  displayOrder?: number | null;
  attrs?: Record<string, unknown>;
}

export async function upsertComponent(
  db: Queryable,
  manifest: SystemManifest,
  c: ComponentInput
): Promise<number> {
  const attrs = c.attrs ?? {};
  const errors = validateAttrs(manifest.attributesSchema, attrs);
  if (errors.length) {
    throw new Error(
      `component attrs failed ${manifest.slug} attributesSchema: ${errors.join("; ")}`
    );
  }
  const res = await db.query(
    `INSERT INTO components (system_id, place_id, container_component_id, role, weight, display_order, attrs)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (system_id, place_id) DO UPDATE SET
       container_component_id = EXCLUDED.container_component_id,
       role = EXCLUDED.role,
       weight = EXCLUDED.weight,
       display_order = EXCLUDED.display_order,
       attrs = components.attrs || EXCLUDED.attrs
     RETURNING id`,
    [
      c.systemId,
      c.placeId,
      c.containerComponentId ?? null,
      c.role ?? "leaf",
      c.weight ?? 1,
      c.displayOrder ?? null,
      JSON.stringify(attrs),
    ]
  );
  return res.rows[0].id;
}

export async function getSystem(
  db: Queryable,
  slug: string
): Promise<{ id: number; manifest: SystemManifest }> {
  const res = await db.query(`SELECT id, manifest FROM systems WHERE slug = $1`, [slug]);
  if (!res.rows[0]) {
    throw new Error(`system '${slug}' not seeded — run: npm run seed:systems`);
  }
  return { id: res.rows[0].id, manifest: res.rows[0].manifest as SystemManifest };
}

// Rank a system's leaves for display: biggest first ("descending by size,
// length, etc."). 'weight' sorts by components.weight (mileage for weighted
// systems); 'area' by geodesic polygon area.
export async function rankComponentsBySize(
  db: Queryable,
  systemId: number,
  mode: "weight" | "area"
): Promise<void> {
  const metric = mode === "weight" ? "c2.weight" : "ST_Area(p.geom::geography)";
  await db.query(
    `UPDATE components c SET display_order = r.rn
     FROM (
       SELECT c2.id, row_number() OVER (ORDER BY ${metric} DESC NULLS LAST) AS rn
       FROM components c2
       JOIN places p ON p.id = c2.place_id
       WHERE c2.system_id = $1 AND c2.role = 'leaf'
     ) r
     WHERE c.id = r.id`,
    [systemId]
  );
}

// Natural Earth ships mixed-case property names between themes/versions;
// resolve case-insensitively so importers don't silently read undefined.
export function prop(props: Record<string, unknown>, ...names: string[]): unknown {
  const lower = new Map(Object.keys(props).map((k) => [k.toLowerCase(), k]));
  for (const n of names) {
    const key = lower.get(n.toLowerCase());
    if (key !== undefined && props[key] !== null && props[key] !== -99 && props[key] !== "-99") {
      return props[key];
    }
  }
  return undefined;
}
