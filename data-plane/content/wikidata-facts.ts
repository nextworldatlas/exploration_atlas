// Content pipeline: structured Wikidata facts (offline, batched SPARQL).
// Runs over every component whose place carries a wikidata QID in
// external_ids; writes rows into facts and a deterministic 'factlist' block
// into the component's Learn content. Cheap, trustworthy, reusable for badges.
// Never runs in a request path.
import { pool } from "../lib/db";

const ENDPOINT = "https://query.wikidata.org/sparql";
const BATCH = 80;

const PROPS: Record<string, { p: string; label: string; numeric?: boolean }> = {
  inception: { p: "P571", label: "Established" },
  area_km2: { p: "P2046", label: "Area (km²)", numeric: true },
  population: { p: "P1082", label: "Population", numeric: true },
  capital: { p: "P36", label: "Capital" },
  highest_point: { p: "P610", label: "Highest point" },
};

interface Subject {
  componentId: number;
  qid: string;
}

async function sparql(qids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const query = `
    SELECT ?item ?inception ?area ?population ?capitalLabel ?highestLabel WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P571 ?inception. }
      OPTIONAL { ?item wdt:P2046 ?area. }
      OPTIONAL { ?item wdt:P1082 ?population. }
      OPTIONAL { ?item wdt:P36 ?capital. }
      OPTIONAL { ?item wdt:P610 ?highest. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`;
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`, {
    headers: { "User-Agent": "next-world-atlas/0.1 (data-plane importer)" },
  });
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] };
  };
  const out = new Map<string, Record<string, unknown>>();
  for (const b of json.results.bindings) {
    const qid = b.item.value.split("/").pop()!;
    const row = out.get(qid) ?? {};
    if (b.inception && !row.inception) row.inception = b.inception.value.slice(0, 10);
    if (b.area && !row.area_km2) row.area_km2 = Number(b.area.value);
    if (b.population && !row.population) row.population = Number(b.population.value);
    if (b.capitalLabel && !row.capital) row.capital = b.capitalLabel.value;
    if (b.highestLabel && !row.highest_point) row.highest_point = b.highestLabel.value;
    out.set(qid, row);
  }
  return out;
}

async function main() {
  const res = await pool.query(
    `SELECT c.id AS component_id, p.external_ids->>'wikidata' AS qid
     FROM components c
     JOIN places p ON p.id = c.place_id
     WHERE c.role = 'leaf' AND p.external_ids ? 'wikidata'`
  );
  const subjects: Subject[] = res.rows.map((r) => ({
    componentId: Number(r.component_id),
    qid: r.qid,
  }));
  console.log(`fetching Wikidata facts for ${subjects.length} components…`);

  let factCount = 0;
  for (let i = 0; i < subjects.length; i += BATCH) {
    const batch = subjects.slice(i, i + BATCH);
    const data = await sparql(batch.map((s) => s.qid));
    for (const s of batch) {
      const values = data.get(s.qid);
      if (!values) continue;
      const items: { label: string; value: unknown }[] = [];
      for (const [key, value] of Object.entries(values)) {
        await pool.query(
          `INSERT INTO facts (subject_type, subject_id, key, value, source)
           VALUES ('component', $1, $2, $3::jsonb, 'wikidata')
           ON CONFLICT (subject_type, subject_id, key) DO UPDATE SET value = EXCLUDED.value`,
          [s.componentId, key, JSON.stringify(value)]
        );
        items.push({ label: PROPS[key]?.label ?? key, value });
        factCount++;
      }
      // Deterministic factlist block for the component's Learn content.
      await pool.query(
        `DELETE FROM content_blocks
         WHERE subject_type = 'component' AND subject_id = $1 AND tab = 'facts' AND source = 'wikidata'`,
        [s.componentId]
      );
      await pool.query(
        `INSERT INTO content_blocks (subject_type, subject_id, tab, block_order, kind, body, source, review_status)
         VALUES ('component', $1, 'facts', 0, 'factlist', $2::jsonb, 'wikidata', 'reviewed')`,
        [s.componentId, JSON.stringify({ items })]
      );
    }
    console.log(`  ${Math.min(i + BATCH, subjects.length)}/${subjects.length}`);
  }
  console.log(`facts: ${factCount} rows`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
