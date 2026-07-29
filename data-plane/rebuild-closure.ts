// Rebuilds place_closure (derived cache) from places.parent_id.
import { pool } from "./lib/db";
import { rebuildClosure } from "../src/lib/closure";

async function main() {
  const n = await rebuildClosure(pool);
  console.log(`rebuilt place_closure: ${n} rows`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
