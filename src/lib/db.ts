// Serving-plane database pool (Next.js server components + route handlers).
import pg from "pg";

const globalForPg = globalThis as unknown as { __nwaPool?: pg.Pool };

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5433/atlas";

// Managed Postgres (Supabase/Neon/…) requires TLS but presents provider-CA
// certificates that fail node-postgres's strict verify-full interpretation of
// sslmode=require. Encrypt without CA verification when the URL asks for SSL.
const wantsSsl = /sslmode=(?!disable)/.test(connectionString);

export const pool =
  globalForPg.__nwaPool ??
  new pg.Pool({
    connectionString,
    max: 10,
    ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPg.__nwaPool = pool;

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params as never);
}
