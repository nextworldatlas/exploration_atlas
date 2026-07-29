import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { getUserId } from "@/lib/user";
import { recomputeProgress } from "@/lib/progress";
import { evaluateBadges } from "@/lib/badges";

async function systemIdOf(componentId: string): Promise<number | null> {
  const res = await query(`SELECT system_id FROM components WHERE id = $1`, [componentId]);
  return res.rows[0]?.system_id ?? null;
}

// POST /api/components/:id/experience  { type?, experienced_on?, note? }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  const systemId = await systemIdOf(id);
  if (!systemId) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const type = typeof body.type === "string" ? body.type : "completed";
  const experiencedOn = body.experienced_on ?? null;
  const note = typeof body.note === "string" ? body.note.slice(0, 2000) : null;

  await query(
    `INSERT INTO experiences (user_id, component_id, type, experienced_on, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, component_id, type) DO UPDATE SET
       experienced_on = EXCLUDED.experienced_on,
       note = COALESCE(EXCLUDED.note, experiences.note)`,
    [userId, id, type, experiencedOn, note]
  );
  await recomputeProgress(pool, userId, systemId);
  const newBadges = await evaluateBadges(pool, userId);

  const progress = await query(
    `SELECT completed_count, total_count, completed_weight, total_weight, pct
     FROM user_system_progress WHERE user_id = $1 AND system_id = $2`,
    [userId, systemId]
  );
  return NextResponse.json({ ok: true, progress: progress.rows[0], newBadges });
}

// DELETE /api/components/:id/experience → unmark (all experience types)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  const systemId = await systemIdOf(id);
  if (!systemId) return NextResponse.json({ error: "not found" }, { status: 404 });

  await query(`DELETE FROM experiences WHERE user_id = $1 AND component_id = $2`, [userId, id]);
  await recomputeProgress(pool, userId, systemId);

  const progress = await query(
    `SELECT completed_count, total_count, completed_weight, total_weight, pct
     FROM user_system_progress WHERE user_id = $1 AND system_id = $2`,
    [userId, systemId]
  );
  return NextResponse.json({ ok: true, progress: progress.rows[0], newBadges: [] });
}
