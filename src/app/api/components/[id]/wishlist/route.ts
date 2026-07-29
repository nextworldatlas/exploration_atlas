import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// POST /api/components/:id/wishlist
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  await query(
    `INSERT INTO wishlist (user_id, component_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, id]
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/components/:id/wishlist
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  await query(`DELETE FROM wishlist WHERE user_id = $1 AND component_id = $2`, [userId, id]);
  return NextResponse.json({ ok: true });
}
