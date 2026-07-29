import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/systems → list + categories + the current user's rollup per system
export async function GET() {
  const userId = await getUserId();
  const res = await query(
    `SELECT s.slug, s.title, s.category, s.status,
            s.manifest->'completion' AS completion,
            s.manifest->'map'->'colors' AS colors,
            count(c.id) FILTER (WHERE c.role = 'leaf')::int AS total_count,
            COALESCE(p.completed_count, 0) AS completed_count,
            COALESCE(p.completed_weight, 0) AS completed_weight,
            COALESCE(p.total_weight, 0) AS total_weight,
            COALESCE(p.pct, 0) AS pct
     FROM systems s
     LEFT JOIN components c ON c.system_id = s.id
     LEFT JOIN user_system_progress p ON p.system_id = s.id AND p.user_id = $1
     WHERE s.status = 'active'
     GROUP BY s.id, p.completed_count, p.completed_weight, p.total_weight, p.pct
     ORDER BY s.category, s.slug`,
    [userId]
  );
  return NextResponse.json({ systems: res.rows });
}
