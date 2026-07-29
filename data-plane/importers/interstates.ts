// US Interstates → one leaf per freeway, weighted by route mileage
// ("% of interstate miles driven").
//
// Scope: MAINLINE routes only (1- and 2-digit, e.g. I-5, I-90). Three-digit
// spurs and loops (I-405, I-495…) are excluded, and routes are NOT split by
// state — each freeway is a single trackable unit. The state intersection
// below is purely a clipping/measuring step (it trims the merged route
// geometry to US territory before measuring geodesic miles).
//
// Source: Natural Earth 10m North America roads (public domain). The shapefile
// is staged into PostGIS with shp2pgsql, then segmentation happens in SQL:
// merge per route number, intersect with the 10m state polygons (edge-matched
// at the same scale), measure geodesic miles. Idempotent: keyed on route/state.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pool } from "../lib/db";
import {
  download,
  getSystem,
  upsertPlace,
  upsertComponent,
  rankComponentsBySize,
  CACHE_DIR,
} from "./lib";

const ROADS_URL = "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_roads_north_america.zip";
const STAGING = "_import_roads_na";
const MIN_SEGMENT_MI = 0.2; // drop border-sliver artifacts, keep real short segments

const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5433/atlas";

function findTool(name: string): string {
  const bundled = path.resolve(import.meta.dirname, "..", "..", ".dev", "pg", "bin", `${name}.exe`);
  if (existsSync(bundled)) return bundled;
  return name; // rely on PATH (e.g. a system PostGIS install)
}

async function stageShapefile(): Promise<void> {
  const zip = await download(ROADS_URL, "ne_10m_roads_north_america.zip");
  const dir = path.join(CACHE_DIR, "ne_10m_roads_north_america");
  // NE zips sometimes extract flat, sometimes into a folder — extract into a
  // dedicated dir and look in both spots.
  const candidates = [
    path.join(dir, "ne_10m_roads_north_america.shp"),
    path.join(dir, "ne_10m_roads_north_america", "ne_10m_roads_north_america.shp"),
  ];
  if (!candidates.some(existsSync)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("tar", ["-xf", zip, "-C", dir]);
  }
  const shpPath = candidates.find(existsSync);
  if (!shpPath) throw new Error("shapefile not found after extraction");

  console.log("staging shapefile into PostGIS…");
  // shp2pgsql -d emits DROP TABLE without IF EXISTS, which trips
  // ON_ERROR_STOP on first run — drop ourselves and use create mode.
  await pool.query(`DROP TABLE IF EXISTS ${STAGING}`);
  await new Promise<void>((resolve, reject) => {
    const shp2pgsql = spawn(findTool("shp2pgsql"), ["-c", "-D", "-s", "4326", shpPath, STAGING]);
    const psql = spawn(findTool("psql"), ["-q", "-v", "ON_ERROR_STOP=1", DB_URL]);
    shp2pgsql.stdout.pipe(psql.stdin);
    let err = "";
    shp2pgsql.stderr.on("data", () => {}); // shp2pgsql narrates progress on stderr
    psql.stderr.on("data", (d) => (err += d));
    // if psql dies early, surface its stderr instead of crashing on EPIPE
    psql.stdin.on("error", () => {});
    shp2pgsql.stdout.on("error", () => {});
    psql.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`psql exited ${code}: ${err}`))
    );
    shp2pgsql.on("error", reject);
    psql.on("error", reject);
  });
}

async function main() {
  const { id: systemId, manifest } = await getSystem(pool, "us-interstates");

  const usRes = await pool.query(
    `SELECT id FROM places WHERE kind = 'country' AND external_ids @> '{"ne_adm0_a3":"USA"}'`
  );
  const usPlaceId: number | null = usRes.rows[0]?.id ?? null;
  const stateCount = await pool.query(`SELECT count(*)::int AS n FROM places WHERE kind = 'us_state'`);
  if (!usPlaceId || stateCount.rows[0].n < 50) {
    throw new Error("countries/states missing — run import:countries first");
  }

  await stageShapefile();

  // Temp tables are per-connection: hold one client for the whole computation.
  const client = await pool.connect();
  try {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [STAGING]
    );
    const names = cols.rows.map((r) => r.column_name);
    for (const required of ["prefix", "number", "geom"]) {
      if (!names.includes(required)) {
        throw new Error(`staging table missing '${required}' column; has: ${names.join(", ")}`);
      }
    }

    console.log("merging routes and cutting state segments…");
    await client.query(`
      CREATE TEMP TABLE route_geoms AS
      SELECT (number::text)::int AS route_number,
             ST_LineMerge(ST_CollectionExtract(ST_Union(geom), 2)) AS geom
      FROM ${STAGING}
      WHERE upper(prefix::text) = 'I' AND number::text ~ '^[0-9]+$'
        AND (number::text)::int < 100   -- mainline only, no 3-digit spurs/loops
      GROUP BY (number::text)::int
    `);
    await client.query(`
      CREATE TEMP TABLE segs AS
      SELECT r.route_number,
             p.id AS state_place_id,
             p.attrs->>'postal' AS postal,
             p.name AS state_name,
             ST_Multi(ST_CollectionExtract(ST_Intersection(r.geom, p.geom), 2)) AS geom
      FROM route_geoms r
      JOIN places p ON p.kind = 'us_state' AND ST_Intersects(r.geom, p.geom)
    `);
    await client.query(`
      DELETE FROM segs
      WHERE ST_IsEmpty(geom) OR ST_Length(geom::geography) / 1609.344 < ${MIN_SEGMENT_MI}
    `);

    const routes = await client.query(`
      SELECT s.route_number,
             ST_AsGeoJSON(ST_LineMerge(ST_Union(s.geom)), 5) AS geojson,
             round((ST_Length(ST_Union(s.geom)::geography) / 1609.344)::numeric, 1) AS length_mi
      FROM segs s
      GROUP BY s.route_number
      ORDER BY s.route_number
    `);

    for (const route of routes.rows) {
      const n = route.route_number;
      const routePlaceId = await upsertPlace(client, {
        kind: "interstate",
        slug: `i-${n}`,
        name: `Interstate ${n}`,
        externalIds: { us_interstate: `I-${n}` },
        parentId: usPlaceId,
        geojson: JSON.parse(route.geojson),
        attrs: { route_number: n, length_mi: Number(route.length_mi) },
      });
      await upsertComponent(client, manifest, {
        systemId,
        placeId: routePlaceId,
        role: "leaf",
        weight: Number(route.length_mi),
        attrs: { route_number: n, length_mi: Number(route.length_mi) },
      });
      console.log(`I-${n}: ${route.length_mi} mi`);
    }
    console.log(`us-interstates: ${routes.rows.length} routes`);
    if (routes.rows.length < 50) {
      throw new Error(`only ${routes.rows.length} routes found — source data looks wrong`);
    }
    await rankComponentsBySize(client, systemId, "weight"); // longest first

    // Reconcile: remove anything outside the current scope left over from
    // earlier runs — per-state segment leaves and 3-digit spurs/loops —
    // including user rows that reference them. Ordered for the self-FKs.
    console.log("pruning out-of-scope components…");
    await client.query(`
      CREATE TEMP TABLE stale_components AS
      SELECT c.id FROM components c
      JOIN places p ON p.id = c.place_id
      WHERE c.system_id = $1
        AND (p.kind = 'interstate_segment'
             OR c.role = 'container'
             OR (c.attrs->>'route_number')::int >= 100)
    `, [systemId]);
    await client.query(`
      CREATE TEMP TABLE stale_places AS
      SELECT p.id, p.kind FROM places p
      WHERE p.kind = 'interstate_segment'
         OR (p.kind = 'interstate' AND (p.attrs->>'route_number')::int >= 100)
    `);
    await client.query(`DELETE FROM experiences WHERE component_id IN (SELECT id FROM stale_components)`);
    await client.query(`DELETE FROM wishlist WHERE component_id IN (SELECT id FROM stale_components)`);
    await client.query(`DELETE FROM facts WHERE subject_type = 'component' AND subject_id IN (SELECT id FROM stale_components)`);
    await client.query(`DELETE FROM content_blocks WHERE subject_type = 'component' AND subject_id IN (SELECT id FROM stale_components)`);
    await client.query(`DELETE FROM components WHERE id IN (SELECT id FROM stale_components) AND role = 'leaf'`);
    await client.query(`DELETE FROM components WHERE id IN (SELECT id FROM stale_components)`);
    await client.query(`DELETE FROM place_closure WHERE ancestor_id IN (SELECT id FROM stale_places) OR descendant_id IN (SELECT id FROM stale_places)`);
    const prunedSegs = await client.query(`DELETE FROM places WHERE id IN (SELECT id FROM stale_places WHERE kind = 'interstate_segment')`);
    const prunedRoutes = await client.query(`DELETE FROM places WHERE id IN (SELECT id FROM stale_places WHERE kind = 'interstate')`);
    console.log(`pruned ${prunedRoutes.rowCount} spur routes, ${prunedSegs.rowCount} segment places`);
  } finally {
    client.release();
  }
  await pool.query(`DROP TABLE IF EXISTS ${STAGING}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
