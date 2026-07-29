// NPS Land Resources Division boundaries → the 63 US National Parks.
// The curated code list in data-plane/seed/national-parks.json is the system
// definition; boundaries are fetched per UNIT_CODE from the public ArcGIS
// FeatureServer. Idempotent: keyed on nps_code. Geographic parent: the state
// containing the park centroid (falls back to the US country place).
import { readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../lib/db";
import { getSystem, upsertPlace, upsertComponent, rankComponentsBySize } from "./lib";

const SERVICE =
  "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/" +
  "NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2/query";

interface ParkSeed {
  code: string;
  name: string;
}

async function fetchBoundaries(codes: string[]) {
  const byCode = new Map<string, { geometry: object; properties: Record<string, unknown> }[]>();
  // Fetch in batches; geometries are simplified server-side (~100 m tolerance)
  // to keep payloads reasonable — plenty for a life-list map.
  const batchSize = 8;
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const where = `UNIT_CODE IN (${batch.map((c) => `'${c}'`).join(",")})`;
    const params = new URLSearchParams({
      where,
      outFields: "UNIT_CODE,UNIT_NAME,UNIT_TYPE,STATE,PARKNAME",
      outSR: "4326",
      maxAllowableOffset: "0.001",
      f: "geojson",
    });
    const res = await fetch(`${SERVICE}?${params}`);
    if (!res.ok) throw new Error(`NPS FeatureServer ${res.status} for batch ${batch.join(",")}`);
    const fc = (await res.json()) as {
      features?: { geometry: object; properties: Record<string, unknown> }[];
      error?: unknown;
    };
    if (fc.error) throw new Error(`NPS FeatureServer error: ${JSON.stringify(fc.error)}`);
    for (const f of fc.features ?? []) {
      const code = String(f.properties.UNIT_CODE ?? "").toUpperCase();
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code)!.push(f);
    }
    console.log(`fetched ${batch.join(",")} (${fc.features?.length ?? 0} features)`);
  }
  return byCode;
}

async function main() {
  const { id: systemId, manifest } = await getSystem(pool, "national-parks");
  const seed = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "..", "seed", "national-parks.json"), "utf8")
  ) as { parks: ParkSeed[] };

  const usRes = await pool.query(
    `SELECT id FROM places WHERE kind = 'country' AND external_ids @> '{"ne_adm0_a3":"USA"}'`
  );
  const usPlaceId: number | null = usRes.rows[0]?.id ?? null;
  if (!usPlaceId) {
    throw new Error("US country place missing — run import:countries first");
  }

  const byCode = await fetchBoundaries(seed.parks.map((p) => p.code));

  const missing: string[] = [];
  let order = 0;
  for (const park of seed.parks) {
    const features = byCode.get(park.code);
    if (!features?.length) {
      missing.push(park.code);
      continue;
    }
    // Some units come back as multiple polygons (districts/tracts): union them
    // client-side into one MultiPolygon-ish GeometryCollection; upsertPlace
    // runs ST_MakeValid + ST_CollectionExtract so this collapses cleanly.
    const geometry =
      features.length === 1
        ? features[0].geometry
        : { type: "GeometryCollection", geometries: features.map((f) => f.geometry) };
    const props = features[0].properties;
    const stateList = String(props.STATE ?? "");
    const primaryState = stateList.split(/[,\s]+/).filter(Boolean)[0] ?? null;

    const stateRes = primaryState
      ? await pool.query(
          `SELECT id FROM places WHERE kind = 'us_state' AND attrs->>'postal' = $1`,
          [primaryState]
        )
      : { rows: [] as { id: number }[] };
    const parentId = stateRes.rows[0]?.id ?? usPlaceId;

    const placeId = await upsertPlace(pool, {
      kind: "national_park",
      slug: park.code.toLowerCase(),
      name: park.name,
      externalIds: { nps_code: park.code },
      parentId,
      geojson: geometry,
      attrs: {
        official_name: props.UNIT_NAME,
        unit_type: props.UNIT_TYPE,
        states: stateList,
      },
    });

    await upsertComponent(pool, manifest, {
      systemId,
      placeId,
      role: "leaf",
      displayOrder: order++,
      attrs: { nps_code: park.code, state: stateList || undefined },
    });
  }

  await rankComponentsBySize(pool, systemId, "area"); // largest park first
  console.log(`national-parks: ${order} components`);
  if (missing.length) {
    throw new Error(`no boundary returned for: ${missing.join(", ")}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
