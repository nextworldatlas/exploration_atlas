// place_closure maintenance. The closure table is a derived cache of
// places.parent_id (geographic containment), used for subtree/ancestor queries.
import type { PoolClient, Pool } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

// Incremental: register one place. Inserts the self row plus one row per
// ancestor of the parent. Safe to re-run (ON CONFLICT DO NOTHING).
export async function insertPlaceClosure(
  db: Queryable,
  placeId: number | string,
  parentId: number | string | null
): Promise<void> {
  await db.query(
    `INSERT INTO place_closure (ancestor_id, descendant_id, depth)
     VALUES ($1, $1, 0)
     ON CONFLICT DO NOTHING`,
    [placeId]
  );
  if (parentId != null) {
    await db.query(
      `INSERT INTO place_closure (ancestor_id, descendant_id, depth)
       SELECT pc.ancestor_id, $1, pc.depth + 1
       FROM place_closure pc
       WHERE pc.descendant_id = $2
       ON CONFLICT DO NOTHING`,
      [placeId, parentId]
    );
  }
}

// Full rebuild from places.parent_id — the authoritative recovery path.
export async function rebuildClosure(db: Queryable): Promise<number> {
  await db.query("TRUNCATE place_closure");
  const res = await db.query(
    `INSERT INTO place_closure (ancestor_id, descendant_id, depth)
     WITH RECURSIVE anc AS (
       SELECT id AS descendant_id, id AS ancestor_id, 0 AS depth FROM places
       UNION ALL
       SELECT a.descendant_id, p.parent_id, a.depth + 1
       FROM anc a
       JOIN places p ON p.id = a.ancestor_id
       WHERE p.parent_id IS NOT NULL
     )
     SELECT ancestor_id, descendant_id, depth FROM anc`
  );
  return res.rowCount ?? 0;
}
