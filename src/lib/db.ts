// Serving-plane database pool (Next.js server components + route handlers).
import pg from "pg";

const globalForPg = globalThis as unknown as { __nwaPool?: pg.Pool };

export const pool =
  globalForPg.__nwaPool ??
  new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://postgres@localhost:5433/atlas",
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPg.__nwaPool = pool;

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params as never);
}
