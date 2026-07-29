import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/search?q= → systems + components (Postgres FTS with ILIKE fallback)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ systems: [], components: [] });
  const userId = await getUserId();

  const systems = await query(
    `SELECT slug, title, category FROM systems
     WHERE status = 'active' AND title ILIKE $1
     LIMIT 5`,
    [`%${q}%`]
  );
  const components = await query(
    `SELECT c.id, p.name, p.kind, s.slug AS system_slug, s.title AS system_title,
            (e.id IS NOT NULL) AS done
     FROM components c
     JOIN systems s ON s.id = c.system_id AND s.status = 'active'
     JOIN places p ON p.id = c.place_id
     LEFT JOIN experiences e ON e.component_id = c.id AND e.user_id = $2
     WHERE c.role = 'leaf'
       AND (to_tsvector('simple', p.name) @@ plainto_tsquery('simple', $1)
            OR p.name ILIKE '%' || $1 || '%')
     ORDER BY p.name
     LIMIT 20`,
    [q, userId]
  );
  return NextResponse.json({ systems: systems.rows, components: components.rows });
}
