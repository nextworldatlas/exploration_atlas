import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/systems/:slug/progress → user rollup + per-container breakdown
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const userId = await getUserId();

  const sys = await query(`SELECT id, manifest FROM systems WHERE slug = $1`, [slug]);
  if (!sys.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  const systemId = sys.rows[0].id;

  const rollup = await query(
    `SELECT completed_count, total_count, completed_weight, total_weight, pct
     FROM user_system_progress WHERE user_id = $1 AND system_id = $2`,
    [userId, systemId]
  );

  // Live totals when the user has no rollup row yet (nothing marked).
  const totals = rollup.rows[0]
    ? rollup.rows[0]
    : (
        await query(
          `SELECT 0 AS completed_count, count(*)::int AS total_count,
                  0 AS completed_weight, COALESCE(sum(weight), 0) AS total_weight, 0 AS pct
           FROM components WHERE system_id = $1 AND role = 'leaf'`,
          [systemId]
        )
      ).rows[0];

  // Per-container breakdown (groupBy: container systems, e.g. per-highway).
  const containers = await query(
    `SELECT cc.id AS container_id, p.name, p.slug,
            count(leaf.id)::int AS total_count,
            count(e.id)::int AS completed_count,
            COALESCE(sum(leaf.weight), 0) AS total_weight,
            COALESCE(sum(leaf.weight) FILTER (WHERE e.id IS NOT NULL), 0) AS completed_weight
     FROM components cc
     JOIN places p ON p.id = cc.place_id
     JOIN components leaf ON leaf.container_component_id = cc.id AND leaf.role = 'leaf'
     LEFT JOIN experiences e ON e.component_id = leaf.id AND e.user_id = $1
     WHERE cc.system_id = $2 AND cc.role = 'container'
     GROUP BY cc.id, p.name, p.slug
     ORDER BY cc.display_order NULLS LAST, p.name`,
    [userId, systemId]
  );

  return NextResponse.json({ ...totals, containers: containers.rows });
}
