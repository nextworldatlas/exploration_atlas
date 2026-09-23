// Dev-database lifecycle for a private PostgreSQL+PostGIS cluster in .dev/pgdata
// (port 5433, trust auth, superuser "postgres"). Works on Linux, macOS and Windows.
// Usage: node scripts/db.mjs init|start|stop|status
//
// Server binaries are looked up in .dev/pg/bin (a portable install), then PATH,
// then the Debian/Ubuntu layout /usr/lib/postgresql/<ver>/bin. PostGIS must be
// installed into the same PostgreSQL (e.g. apt install postgresql-16-postgis-3).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, ".dev", "pgdata");
const logFile = path.join(root, ".dev", "pg.log");
const port = "5433";
const exe = process.platform === "win32" ? ".exe" : "";

function binDir() {
  const portable = path.join(root, ".dev", "pg", "bin");
  if (existsSync(path.join(portable, `pg_ctl${exe}`))) return portable;
  try {
    execFileSync(`pg_ctl${exe}`, ["--version"], { stdio: "ignore" });
    return ""; // on PATH
  } catch {}
  const debian = "/usr/lib/postgresql";
  if (existsSync(debian)) {
    const newest = readdirSync(debian).sort((a, b) => Number(b) - Number(a))[0];
    if (newest) return path.join(debian, newest, "bin");
  }
  console.error(
    "PostgreSQL server binaries (pg_ctl, initdb) not found.\n" +
      "Install PostgreSQL + PostGIS (see README 'Getting started'), or point\n" +
      "DATABASE_URL at any PostGIS 3.x database and skip db:init/db:start."
  );
  process.exit(1);
}

const bin = binDir();
const tool = (name) => path.join(bin, `${name}${exe}`);

// PostgreSQL refuses to run as root (the norm in cloud containers), so there
// the server tools run as the "postgres" system user, which owns .dev/pgdata.
const asRoot = process.getuid?.() === 0;
function run(name, args) {
  if (asRoot) {
    execFileSync("runuser", ["-u", "postgres", "--", tool(name), ...args], { stdio: "inherit" });
  } else {
    execFileSync(tool(name), args, { stdio: "inherit" });
  }
}
if (asRoot) {
  mkdirSync(path.join(root, ".dev"), { recursive: true });
  execFileSync("chown", ["postgres:", path.join(root, ".dev")]);
}

function start() {
  try {
    run("pg_ctl", ["-D", dataDir, "status"]);
    return; // already running
  } catch {}
  run("pg_ctl", ["-D", dataDir, "-l", logFile, "-o", `-p ${port}`, "-w", "start"]);
}

const cmd = process.argv[2];
try {
  switch (cmd) {
    case "init":
      if (existsSync(path.join(dataDir, "PG_VERSION"))) {
        console.log(`Cluster already exists at ${dataDir}`);
      } else {
        run("initdb", ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8"]);
      }
      start();
      try {
        run("createdb", ["-h", "localhost", "-p", port, "-U", "postgres", "atlas"]);
      } catch {
        console.log("Database atlas already exists.");
      }
      break;
    case "start":
      start();
      break;
    case "stop":
      run("pg_ctl", ["-D", dataDir, "stop"]);
      break;
    case "status":
      run("pg_ctl", ["-D", dataDir, "status"]);
      break;
    default:
      console.error("Usage: node scripts/db.mjs init|start|stop|status");
      process.exit(1);
  }
} catch (e) {
  process.exit(e.status ?? 1);
}
