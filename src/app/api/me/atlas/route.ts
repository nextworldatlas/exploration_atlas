import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/me/atlas → cross-system Life Atlas rollup
export async function GET() {
  const userId = await getUserId();

  const systems = await query(
    `SELECT s.slug, s.title, s.category, s.manifest->'completion' AS completion,
            COALESCE(p.completed_count, 0) AS completed_count,
            COALESCE(p.total_count, t.total)::int AS total_count,
            COALESCE(p.completed_weight, 0) AS completed_weight,
            COALESCE(p.total_weight, t.weight) AS total_weight,
            COALESCE(p.pct, 0) AS pct
     FROM systems s
     JOIN LATERAL (
       SELECT count(*)::int AS total, COALESCE(sum(weight), 0) AS weight
       FROM components c WHERE c.system_id = s.id AND c.role = 'leaf'
     ) t ON true
     LEFT JOIN user_system_progress p ON p.system_id = s.id AND p.user_id = $1
     WHERE s.status = 'active'
     ORDER BY COALESCE(p.pct, 0) DESC, s.title`,
    [userId]
  );

  const recent = await query(
    `SELECT e.component_id, e.type, e.experienced_on, e.created_at,
            p.name, s.slug AS system_slug, s.title AS system_title
     FROM experiences e
     JOIN components c ON c.id = e.component_id
     JOIN places p ON p.id = c.place_id
     JOIN systems s ON s.id = c.system_id
     WHERE e.user_id = $1
     ORDER BY e.created_at DESC
     LIMIT 10`,
    [userId]
  );

  const wishlist = await query(
    `SELECT w.component_id, p.name, s.slug AS system_slug, s.title AS system_title
     FROM wishlist w
     JOIN components c ON c.id = w.component_id
     JOIN places p ON p.id = c.place_id
     JOIN systems s ON s.id = c.system_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC
     LIMIT 50`,
    [userId]
  );

  return NextResponse.json({
    systems: systems.rows,
    recent: recent.rows,
    wishlist: wishlist.rows,
  });
}
