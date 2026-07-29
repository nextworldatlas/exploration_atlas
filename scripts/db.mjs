// Dev-database lifecycle for the portable PostgreSQL+PostGIS cluster in .dev/.
// Usage: node scripts/db.mjs start|stop|status
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pgCtl = path.join(root, ".dev", "pg", "bin", "pg_ctl.exe");
const dataDir = path.join(root, ".dev", "pgdata");
const logFile = path.join(root, ".dev", "pg.log");

if (!existsSync(pgCtl)) {
  console.error(
    "Portable cluster not found at .dev/pg. See README 'Database' for setup,\n" +
      "or point DATABASE_URL at any PostGIS 3.x database and skip db:start."
  );
  process.exit(1);
}

const cmd = process.argv[2];
const args = {
  start: ["-D", dataDir, "-l", logFile, "-w", "start"],
  stop: ["-D", dataDir, "stop"],
  status: ["-D", dataDir, "status"],
}[cmd];

if (!args) {
  console.error("Usage: node scripts/db.mjs start|stop|status");
  process.exit(1);
}

try {
  execFileSync(pgCtl, args, { stdio: "inherit" });
} catch (e) {
  process.exit(e.status ?? 1);
}
