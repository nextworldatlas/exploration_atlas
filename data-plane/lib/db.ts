// Data-plane database pool. Standalone from the Next.js app on purpose:
// importers, tile builds, and content jobs run offline, never in a request path.
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5433/atlas";

// Same TLS handling as the serving pool: managed providers need encryption
// without strict provider-CA verification (see src/lib/db.ts).
const wantsSsl = /sslmode=(?!disable)/.test(connectionString);

export const pool = new pg.Pool({
  connectionString,
  ...(wantsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params as never);
}
