// Natural Earth → countries (admin-0, 50m) + US states (admin-1, 10m).
// Idempotent: keyed on ne_adm0_a3 / iso_3166_2. Also registers the geographic
// spine: states' parent is the US country place.
//
// The countries system composition tree mirrors the user's GeoVision/Vision
// Atlas hierarchy (data-plane/seed/vision-atlas-regions.csv):
//   continent (container) → region (container) → country (leaf)
// Countries the CSV spreads across several regions (federations like the US,
// whose "regions" are state groupings) sit directly under their continent.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../lib/db";
import {
  download,
  getSystem,
  prop,
  upsertPlace,
  upsertComponent,
  rankComponentsBySize,
} from "./lib";

const COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const STATES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

// The us-states system tracks the classic 50; DC and territories are imported
// as places (they anchor parks and future systems) but are not components.
const FIFTY_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ")
);

// ---------- Vision Atlas hierarchy (continent → region → country) ----------

const CONTINENTS = new Set([
  "Africa", "Antarctica", "Asia", "Europe", "North America", "Oceania", "South America",
]);

// Natural Earth name (normalized) → Vision Atlas CSV name (normalized),
// for the handful that plain normalization doesn't bridge.
const NAME_ALIASES: Record<string, string> = {
  "falkland islands malvinas": "falkland islands",
  "timor leste": "east timor",
  "tanzania": "united republic of tanzania",
  "kingdom of eswatini": "swaziland",
  "eswatini": "swaziland",
  "serbia": "republic of serbia",
  "north macedonia": "macedonia",
  "wallis and futuna islands": "wallis and futuna",
  "faeroe islands": "faroe islands",
  "cote d ivoire": "ivory coast",
  "macao": "macau s a r",
  "hong kong": "hong kong s a r",
  "heard i and mcdonald islands": "heard island and mcdonald islands",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const slugify = (s: string) => norm(s).replace(/ /g, "-");

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

interface VisionEntry {
  continent: string;
  region: string | null; // null = multi-region federation → sits under continent
}

function loadVisionAtlas(): Map<string, VisionEntry> {
  const file = path.resolve(import.meta.dirname, "..", "seed", "vision-atlas-regions.csv");
  const rows = readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter(Boolean).map(parseCsvLine);
  const agg = new Map<string, { continent: string; regions: Set<string> }>();
  for (const [country, continent, region] of rows) {
    const key = norm(country);
    if (!agg.has(key)) agg.set(key, { continent, regions: new Set() });
    if (region) agg.get(key)!.regions.add(region);
  }
  const out = new Map<string, VisionEntry>();
  for (const [key, { continent, regions }] of agg) {
    out.set(key, {
      continent,
      region: regions.size === 1 ? [...regions][0] : null,
    });
  }
  return out;
}

async function importCountries(): Promise<number> {
  const { id: systemId, manifest } = await getSystem(pool, "countries");
  const file = await download(COUNTRIES_URL, "ne_50m_admin_0_countries.geojson");
  const fc = JSON.parse(readFileSync(file, "utf8"));
  const vision = loadVisionAtlas();

  // Lazily created container components, keyed by continent / continent+region.
  const continentComps = new Map<string, { placeId: number; componentId: number }>();
  const regionComps = new Map<string, number>();

  const ensureContinent = async (continent: string) => {
    if (!continentComps.has(continent)) {
      const placeId = await upsertPlace(pool, {
        kind: "continent",
        slug: slugify(continent),
        name: continent,
        externalIds: { vision_atlas_continent: continent },
        parentId: null,
        attrs: {},
      });
      const componentId = await upsertComponent(pool, manifest, {
        systemId,
        placeId,
        role: "container",
        attrs: {},
      });
      continentComps.set(continent, { placeId, componentId });
    }
    return continentComps.get(continent)!;
  };

  const ensureRegion = async (continent: string, region: string) => {
    const key = `${continent}/${region}`;
    if (!regionComps.has(key)) {
      const parent = await ensureContinent(continent);
      const placeId = await upsertPlace(pool, {
        kind: "world_region",
        slug: `${slugify(continent)}-${slugify(region)}`,
        name: region,
        externalIds: { vision_atlas_region: key },
        parentId: parent.placeId,
        attrs: { group: continent },
      });
      const componentId = await upsertComponent(pool, manifest, {
        systemId,
        placeId,
        role: "container",
        containerComponentId: parent.componentId,
        // 'group' surfaces the continent in list headers (see components API)
        attrs: { group: continent },
      });
      regionComps.set(key, componentId);
    }
    return regionComps.get(key)!;
  };

  let usPlaceId = 0;
  let count = 0;
  let unmatched = 0;
  for (const f of fc.features) {
    const p = f.properties ?? {};
    const adm0 = String(prop(p, "ADM0_A3") ?? "");
    const name = String(prop(p, "NAME", "ADMIN") ?? "");
    if (!adm0 || !name) continue;
    const nameLong = String(prop(p, "NAME_LONG") ?? name);
    const iso2 = prop(p, "ISO_A2_EH", "ISO_A2") as string | undefined;
    const iso3 = prop(p, "ISO_A3_EH", "ISO_A3") as string | undefined;
    const wikidata = prop(p, "WIKIDATAID") as string | undefined;

    // Resolve the Vision Atlas entry: direct name match, then alias.
    const candidates = [norm(nameLong), norm(name)];
    candidates.push(...candidates.map((c) => NAME_ALIASES[c]).filter(Boolean));
    const entry = candidates.map((c) => vision.get(c)).find(Boolean);
    // Fall back to NE's continent when the CSV doesn't know the country.
    const neContinent = String(prop(p, "CONTINENT") ?? "");
    const continent = entry?.continent ?? (CONTINENTS.has(neContinent) ? neContinent : null);
    if (!entry) unmatched++;

    const containerComponentId = entry?.region
      ? await ensureRegion(entry.continent, entry.region)
      : continent
        ? (await ensureContinent(continent)).componentId
        : null;

    const externalIds: Record<string, string> = { ne_adm0_a3: adm0 };
    if (iso3) externalIds.iso3166_1_a3 = iso3;
    if (iso2) externalIds.iso3166_1 = iso2;
    if (wikidata) externalIds.wikidata = wikidata;

    const placeId = await upsertPlace(pool, {
      kind: "country",
      slug: adm0.toLowerCase(),
      name,
      externalIds,
      parentId: continent ? (await ensureContinent(continent)).placeId : null,
      geojson: f.geometry,
      attrs: {
        continent,
        region: entry?.region ?? null,
        pop_est: prop(p, "POP_EST"),
        subregion: prop(p, "SUBREGION"),
      },
    });
    if (adm0 === "USA") usPlaceId = placeId;

    await upsertComponent(pool, manifest, {
      systemId,
      placeId,
      containerComponentId,
      role: "leaf",
      attrs: {
        iso_a2: iso2 ?? undefined,
        continent: continent ?? undefined,
        pop_est: (prop(p, "POP_EST") as number) ?? undefined,
      },
    });
    count++;
  }
  await rankComponentsBySize(pool, systemId, "area"); // largest country first
  console.log(
    `countries: ${count} leaves, ${continentComps.size} continents, ${regionComps.size} regions` +
      (unmatched ? ` (${unmatched} not in Vision Atlas CSV → continent fallback)` : "")
  );
  if (!usPlaceId) throw new Error("USA not found in admin-0 — states need it as parent");
  return usPlaceId;
}

async function importUsStates(usPlaceId: number): Promise<void> {
  const { id: systemId, manifest } = await getSystem(pool, "us-states");
  const file = await download(STATES_URL, "ne_10m_admin_1_states_provinces.geojson");
  const fc = JSON.parse(readFileSync(file, "utf8"));

  let components = 0;
  let placesOnly = 0;
  for (const f of fc.features) {
    const p = f.properties ?? {};
    if (String(prop(p, "adm0_a3") ?? "") !== "USA") continue;
    const iso = String(prop(p, "iso_3166_2") ?? ""); // e.g. US-CA
    const postal = String(prop(p, "postal") ?? iso.slice(3));
    const name = String(prop(p, "name") ?? "");
    if (!iso || !name) continue;

    const externalIds: Record<string, string> = { iso3166_2: iso };
    const wikidata = prop(p, "wikidataid") as string | undefined;
    if (wikidata) externalIds.wikidata = wikidata;

    const placeId = await upsertPlace(pool, {
      kind: "us_state",
      slug: iso.toLowerCase(),
      name,
      externalIds,
      parentId: usPlaceId,
      geojson: f.geometry,
      attrs: { postal, region: prop(p, "region") },
    });

    if (FIFTY_STATES.has(postal)) {
      await upsertComponent(pool, manifest, {
        systemId,
        placeId,
        role: "leaf",
        displayOrder: components++,
        attrs: { postal, region: (prop(p, "region") as string) ?? undefined },
      });
    } else {
      placesOnly++;
    }
  }
  await rankComponentsBySize(pool, systemId, "area"); // largest state first
  console.log(`us-states: ${components} components (+${placesOnly} territory places)`);
  if (components !== 50) {
    throw new Error(`expected 50 state components, got ${components}`);
  }
}

async function main() {
  const usPlaceId = await importCountries();
  await importUsStates(usPlaceId);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
