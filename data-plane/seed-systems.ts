// Upserts every manifest in data-plane/manifests into systems, gated by the
// manifest validator. An invalid manifest fails loudly here — never at request
// time. Idempotent: keyed on slug.
//
// --sql prints the same upserts as one SQL transaction instead of running them,
// for databases reachable only through a SQL console (e.g. Supabase's editor).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "./lib/db";
import { validateManifest } from "../src/lib/manifest";

const UPSERT = `INSERT INTO systems (slug, title, category, manifest)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         manifest = EXCLUDED.manifest`;

// SQL literal that cannot be broken out of: dollar-quote with a tag absent from the value
function literal(value: string): string {
  let tag = "m";
  while (value.includes(`$${tag}$`)) tag += "m";
  return `$${tag}$${value}$${tag}$`;
}

async function main() {
  const asSql = process.argv.includes("--sql");
  if (asSql) console.log("BEGIN;");
  const dir = path.resolve(import.meta.dirname, "manifests");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const manifest = validateManifest(raw); // throws with a precise path on failure
    const params = [manifest.slug, manifest.title, manifest.category, JSON.stringify(manifest)];
    if (asSql) {
      console.log(UPSERT.replace(/\$(\d)/g, (_, i) => literal(params[Number(i) - 1])) + ";");
      continue;
    }
    await pool.query(UPSERT, params);
    console.log(`upserted system ${manifest.slug}`);
  }
  if (asSql) console.log("COMMIT;");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
