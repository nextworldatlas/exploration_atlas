// Serving-plane database pool (Next.js server components + route handlers).
import pg from "pg";

const globalForPg = globalThis as unknown as { __nwaPool?: pg.Pool };

// Managed Postgres (Supabase/Neon/…) requires TLS but presents provider-CA
// certificates that fail node-postgres's strict verify-full interpretation of
// sslmode=require — and a sslmode param in the URL overrides any ssl option
// passed alongside it. So: strip the param and control TLS explicitly.
//
// TLS is on for any remote host so the URL needs no sslmode parameter at all;
// that keeps deployment values free of characters (%, ?, &) that hosting
// panels are prone to shell-escaping.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

export function sslConfig(raw: string): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  try {
    const url = new URL(raw);
    const mode = url.searchParams.get("sslmode");
    if (mode === "disable") return { connectionString: raw };
    if (!mode && LOCAL_HOSTS.has(url.hostname)) return { connectionString: raw };
    url.searchParams.delete("sslmode");
    return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
  } catch {
    return { connectionString: raw };
  }
}

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5433/atlas";

export const pool =
  globalForPg.__nwaPool ??
  new pg.Pool({ max: 10, ...sslConfig(connectionString) });

if (process.env.NODE_ENV !== "production") globalForPg.__nwaPool = pool;

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params as never);
}
