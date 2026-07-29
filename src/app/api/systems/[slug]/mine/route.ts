import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/systems/:slug/mine → compact id arrays for the map's personal
// overlay (client feeds these straight into map.setFeatureState).
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const userId = await getUserId();
  const done = await query(
    `SELECT c.id FROM components c
     JOIN systems s ON s.id = c.system_id
     JOIN experiences e ON e.component_id = c.id
     WHERE s.slug = $1 AND e.user_id = $2`,
    [slug, userId]
  );
  const wish = await query(
    `SELECT c.id FROM components c
     JOIN systems s ON s.id = c.system_id
     JOIN wishlist w ON w.component_id = c.id
     WHERE s.slug = $1 AND w.user_id = $2`,
    [slug, userId]
  );
  return NextResponse.json({
    completed: done.rows.map((r) => Number(r.id)),
    wishlist: wish.rows.map((r) => Number(r.id)),
  });
}
