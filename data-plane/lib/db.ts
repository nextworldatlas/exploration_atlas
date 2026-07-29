// Data-plane database pool. Standalone from the Next.js app on purpose:
// importers, tile builds, and content jobs run offline, never in a request path.
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5433/atlas";

export const pool = new pg.Pool({ connectionString });

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params as never);
}
