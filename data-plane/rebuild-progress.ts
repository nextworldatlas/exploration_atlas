// Guardrail: progress is derived, never authoritative. This rebuilds every
// (user, system) row in user_system_progress from the experiences table.
import { pool } from "./lib/db";
import { rebuildAllProgress } from "../src/lib/progress";

async function main() {
  const n = await rebuildAllProgress(pool);
  console.log(`rebuilt ${n} user_system_progress rows`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
