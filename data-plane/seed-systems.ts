// Upserts every manifest in data-plane/manifests into systems, gated by the
// manifest validator. An invalid manifest fails loudly here — never at request
// time. Idempotent: keyed on slug.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "./lib/db";
import { validateManifest } from "../src/lib/manifest";

async function main() {
  const dir = path.resolve(import.meta.dirname, "manifests");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const manifest = validateManifest(raw); // throws with a precise path on failure
    await pool.query(
      `INSERT INTO systems (slug, title, category, manifest)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         manifest = EXCLUDED.manifest`,
      [manifest.slug, manifest.title, manifest.category, JSON.stringify(manifest)]
    );
    console.log(`upserted system ${manifest.slug}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
