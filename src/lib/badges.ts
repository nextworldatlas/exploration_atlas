// Badge engine. Badges are data (badges.rule JSONB); this is the one engine
// that evaluates them, on each experience write, against user_system_progress
// and components. New badge = new row; only a new rule *type* touches code.
import type { PoolClient, Pool } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;

export type BadgeRule =
  | { type: "first"; system: string }
  | { type: "count"; system: string; gte: number }
  | { type: "weight"; system: string; gte: number }
  // Complete every leaf inside the scope. scope 'system' = all leaves in the
  // system; scope 'container' = all leaves under at least one of the named
  // container components (matched by their place slug).
  | { type: "set"; system: string; scope: "system" | "container"; anyOf?: string[] };

export interface EarnedBadge {
  slug: string;
  title: string;
  icon: string | null;
}

async function ruleSatisfied(db: Queryable, userId: string, rule: BadgeRule): Promise<boolean> {
  const prog = await db.query(
    `SELECT p.completed_count, p.completed_weight
     FROM user_system_progress p
     JOIN systems s ON s.id = p.system_id
     WHERE p.user_id = $1 AND s.slug = $2`,
    [userId, rule.system]
  );
  const row = prog.rows[0];

  switch (rule.type) {
    case "first":
      return !!row && row.completed_count >= 1;
    case "count":
      return !!row && row.completed_count >= rule.gte;
    case "weight":
      return !!row && Number(row.completed_weight) >= rule.gte;
    case "set": {
      if (rule.scope === "system") {
        const res = await db.query(
          `SELECT count(*)::int AS missing
           FROM components c
           JOIN systems s ON s.id = c.system_id
           WHERE s.slug = $2 AND c.role = 'leaf'
             AND NOT EXISTS (
               SELECT 1 FROM experiences e
               WHERE e.component_id = c.id AND e.user_id = $1
             )`,
          [userId, rule.system]
        );
        const total = await db.query(
          `SELECT count(*)::int AS n FROM components c
           JOIN systems s ON s.id = c.system_id
           WHERE s.slug = $1 AND c.role = 'leaf'`,
          [rule.system]
        );
        return total.rows[0].n > 0 && res.rows[0].missing === 0;
      }
      // container scope: satisfied if ANY named entry is fully complete. The
      // named place slug may be a container (all leaves under it) or a leaf
      // itself (systems whose top level is directly trackable).
      for (const containerSlug of rule.anyOf ?? []) {
        const res = await db.query(
          `SELECT
             count(*)::int AS total,
             count(*) FILTER (
               WHERE EXISTS (
                 SELECT 1 FROM experiences e
                 WHERE e.component_id = leaf.id AND e.user_id = $1
               )
             )::int AS done
           FROM components leaf
           JOIN systems s ON s.id = leaf.system_id
           JOIN places lp ON lp.id = leaf.place_id
           LEFT JOIN components container ON container.id = leaf.container_component_id
           LEFT JOIN places cp ON cp.id = container.place_id
           WHERE s.slug = $2 AND leaf.role = 'leaf'
             AND (cp.slug = $3 OR lp.slug = $3)`,
          [userId, rule.system, containerSlug]
        );
        const { total, done } = res.rows[0];
        if (total > 0 && done === total) return true;
      }
      return false;
    }
  }
}

// Evaluate all not-yet-earned badges for a user; award and return new ones.
export async function evaluateBadges(db: Queryable, userId: string): Promise<EarnedBadge[]> {
  const badges = await db.query(
    `SELECT b.id, b.slug, b.title, b.icon, b.rule
     FROM badges b
     WHERE NOT EXISTS (
       SELECT 1 FROM user_badges ub WHERE ub.badge_id = b.id AND ub.user_id = $1
     )`,
    [userId]
  );
  const earned: EarnedBadge[] = [];
  for (const b of badges.rows) {
    if (await ruleSatisfied(db, userId, b.rule as BadgeRule)) {
      await db.query(
        `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [userId, b.id]
      );
      earned.push({ slug: b.slug, title: b.title, icon: b.icon });
    }
  }
  return earned;
}
