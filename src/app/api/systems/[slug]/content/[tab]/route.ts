import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/systems/:slug/content/:tab → ordered content_blocks (system-level)
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string; tab: string }> }
) {
  const { slug, tab } = await ctx.params;
  const res = await query(
    `SELECT cb.id, cb.tab, cb.block_order, cb.kind, cb.body, cb.source, cb.review_status
     FROM content_blocks cb
     JOIN systems s ON s.id = cb.subject_id
     WHERE cb.subject_type = 'system' AND s.slug = $1 AND cb.tab = $2
     ORDER BY cb.block_order`,
    [slug, tab]
  );
  return NextResponse.json({ blocks: res.rows });
}
