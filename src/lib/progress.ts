// Progress is derived, never authoritative: experiences is the source of
// truth, user_system_progress is a rebuildable cache recomputed here on every
// experience write. O(components-in-one-system) per spec §3.
import type { PoolClient, Pool } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

export async function recomputeProgress(
  db: Queryable,
  userId: string,
  systemId: number | string
): Promise<void> {
  await db.query(
    `WITH leaf AS (
       SELECT c.id, c.weight
       FROM components c
       WHERE c.system_id = $2 AND c.role = 'leaf'
     ),
     done AS (
       SELECT l.id, l.weight
       FROM leaf l
       WHERE EXISTS (
         SELECT 1 FROM experiences e
         WHERE e.component_id = l.id AND e.user_id = $1
       )
     ),
     agg AS (
       SELECT
         (SELECT count(*) FROM done)::int                AS completed_count,
         (SELECT count(*) FROM leaf)::int                AS total_count,
         COALESCE((SELECT sum(weight) FROM done), 0)     AS completed_weight,
         COALESCE((SELECT sum(weight) FROM leaf), 0)     AS total_weight,
         (SELECT s.manifest->'completion'->>'rule' FROM systems s WHERE s.id = $2) AS rule
     )
     INSERT INTO user_system_progress
       (user_id, system_id, completed_count, total_count, completed_weight, total_weight, pct, updated_at)
     SELECT $1, $2, completed_count, total_count, completed_weight, total_weight,
       CASE
         WHEN rule = 'weighted' AND total_weight > 0
           THEN round(completed_weight / total_weight * 100, 2)
         WHEN total_count > 0
           THEN round(completed_count::numeric / total_count * 100, 2)
         ELSE 0
       END,
       now()
     FROM agg
     ON CONFLICT (user_id, system_id) DO UPDATE SET
       completed_count  = EXCLUDED.completed_count,
       total_count      = EXCLUDED.total_count,
       completed_weight = EXCLUDED.completed_weight,
       total_weight     = EXCLUDED.total_weight,
       pct              = EXCLUDED.pct,
       updated_at       = now()`,
    [userId, systemId]
  );
}

// Rebuild every (user, system) rollup from scratch — the guardrail-mandated
// recovery path (see data-plane/rebuild-progress.ts).
export async function rebuildAllProgress(db: Queryable): Promise<number> {
  const users = await db.query(`SELECT DISTINCT user_id FROM experiences`);
  const systems = await db.query(`SELECT id FROM systems`);
  await db.query("TRUNCATE user_system_progress");
  let n = 0;
  for (const u of users.rows) {
    for (const s of systems.rows) {
      await recomputeProgress(db, u.user_id, s.id);
      n++;
    }
  }
  return n;
}
