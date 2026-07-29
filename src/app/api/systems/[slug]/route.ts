import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/systems/:slug → manifest + global stats
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const res = await query(
    `SELECT s.id, s.slug, s.title, s.category, s.manifest,
            count(c.id) FILTER (WHERE c.role = 'leaf')::int AS total_count,
            count(c.id) FILTER (WHERE c.role = 'container')::int AS container_count,
            COALESCE(sum(c.weight) FILTER (WHERE c.role = 'leaf'), 0) AS total_weight
     FROM systems s
     LEFT JOIN components c ON c.system_id = s.id
     WHERE s.slug = $1
     GROUP BY s.id`,
    [slug]
  );
  if (!res.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}
