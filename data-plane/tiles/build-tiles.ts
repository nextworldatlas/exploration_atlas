// Tile build (data plane, per system):
//   PostGIS ── ST_AsGeoJSON ──▶ leaf features (id = component_id, ALWAYS)
//           ── geojson-vt + vt-pbf ──▶ MBTiles (node:sqlite)
//           ── go-pmtiles convert ──▶ public/tiles/{slug}.pmtiles
//
// The personal overlay hinges on feature id == component_id: the client sets
// feature-state by component id to recolor done/missing without per-user tiles.
//
// In production with tippecanoe available, the equivalent is:
//   tippecanoe -o {slug}.pmtiles -l components --use-attribute-for-id=component_id …
// This Node pipeline exists so the whole build runs anywhere Node runs.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import geojsonvt from "geojson-vt";
// @ts-expect-error vt-pbf ships no types
import vtpbf from "vt-pbf";
import { pool } from "../lib/db";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "public", "tiles");

const MAX_ZOOM: Record<string, number> = { line: 10, polygon: 9, point: 12 };

function findPmtiles(): string {
  const bundled = path.join(ROOT, ".dev", "bin", "go-pmtiles", "pmtiles.exe");
  return existsSync(bundled) ? bundled : "pmtiles";
}

async function buildSystem(slug: string): Promise<void> {
  const sys = await pool.query(`SELECT id, manifest FROM systems WHERE slug = $1`, [slug]);
  if (!sys.rows[0]) throw new Error(`unknown system '${slug}'`);
  const systemId = sys.rows[0].id;
  const geometryType: string = sys.rows[0].manifest.geometryType;
  const sourceLayer: string = sys.rows[0].manifest.map.sourceLayer;
  const maxZoom = MAX_ZOOM[geometryType] ?? 10;

  const res = await pool.query(
    `SELECT c.id AS component_id, p.name, p.slug, c.role, c.attrs,
            ST_AsGeoJSON(p.geom, 6) AS geometry
     FROM components c
     JOIN places p ON p.id = c.place_id
     WHERE c.system_id = $1 AND c.role = 'leaf' AND p.geom IS NOT NULL`,
    [systemId]
  );
  const bounds = await pool.query(
    `SELECT ST_XMin(e) AS xmin, ST_YMin(e) AS ymin, ST_XMax(e) AS xmax, ST_YMax(e) AS ymax
     FROM (
       SELECT ST_Extent(p.geom) AS e
       FROM components c JOIN places p ON p.id = c.place_id
       WHERE c.system_id = $1 AND c.role = 'leaf'
     ) s`,
    [systemId]
  );

  const features = res.rows.map((r) => {
    // scalar component attrs ride along as tile properties so manifest layers
    // (e.g. label expressions) can reference them
    const scalarAttrs = Object.fromEntries(
      Object.entries((r.attrs ?? {}) as Record<string, unknown>).filter(
        ([, v]) => ["string", "number", "boolean"].includes(typeof v)
      )
    );
    return {
      type: "Feature" as const,
      id: Number(r.component_id), // guardrail: PMTiles feature id = component_id
      geometry: JSON.parse(r.geometry),
      properties: { ...scalarAttrs, name: r.name, slug: r.slug },
    };
  });
  console.log(`${slug}: ${features.length} leaf features → tiles (maxzoom ${maxZoom})`);

  const index = geojsonvt(
    { type: "FeatureCollection", features },
    { maxZoom, indexMaxZoom: 5, buffer: 64, extent: 4096 }
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const mbtilesPath = path.join(OUT_DIR, `${slug}.mbtiles`);
  rmSync(mbtilesPath, { force: true });
  const db = new DatabaseSync(mbtilesPath);
  db.exec(`
    CREATE TABLE metadata (name TEXT, value TEXT);
    CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
    CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
  `);
  const insertTile = db.prepare(
    `INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)`
  );

  let count = 0;
  // Depth-first over the tile pyramid; geojson-vt returns null for empty
  // tiles, which prunes whole subtrees.
  const walk = (z: number, x: number, y: number): void => {
    const tile = index.getTile(z, x, y);
    if (!tile || tile.features.length === 0) return;
    const pbf = vtpbf.fromGeojsonVt({ [sourceLayer]: tile }, { version: 2 });
    const tmsY = (1 << z) - 1 - y; // MBTiles stores rows in TMS scheme
    insertTile.run(z, x, tmsY, gzipSync(Buffer.from(pbf)));
    count++;
    if (z < maxZoom) {
      for (const [cx, cy] of [
        [2 * x, 2 * y],
        [2 * x + 1, 2 * y],
        [2 * x, 2 * y + 1],
        [2 * x + 1, 2 * y + 1],
      ]) {
        walk(z + 1, cx, cy);
      }
    }
  };
  walk(0, 0, 0);

  const b = bounds.rows[0];
  const meta = db.prepare(`INSERT INTO metadata (name, value) VALUES (?, ?)`);
  const metadata: Record<string, string> = {
    name: slug,
    format: "pbf",
    minzoom: "0",
    maxzoom: String(maxZoom),
    bounds: [b.xmin, b.ymin, b.xmax, b.ymax].join(","),
    center: `${(Number(b.xmin) + Number(b.xmax)) / 2},${(Number(b.ymin) + Number(b.ymax)) / 2},3`,
    type: "overlay",
    json: JSON.stringify({
      vector_layers: [
        { id: sourceLayer, fields: { name: "String", slug: "String" } },
      ],
    }),
  };
  for (const [k, v] of Object.entries(metadata)) meta.run(k, v);
  db.close();

  const pmtilesPath = path.join(OUT_DIR, `${slug}.pmtiles`);
  rmSync(pmtilesPath, { force: true });
  execFileSync(findPmtiles(), ["convert", mbtilesPath, pmtilesPath], { stdio: "inherit" });
  rmSync(mbtilesPath, { force: true });
  console.log(`${slug}: ${count} tiles → public/tiles/${slug}.pmtiles`);
}

async function main() {
  const arg = process.argv[2];
  const slugs = arg
    ? [arg]
    : (await pool.query(`SELECT slug FROM systems WHERE status = 'active' ORDER BY slug`)).rows.map(
        (r) => r.slug
      );
  for (const slug of slugs) await buildSystem(slug);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
