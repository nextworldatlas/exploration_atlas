import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/me/badges → every badge with earned status
export async function GET() {
  const userId = await getUserId();
  const res = await query(
    `SELECT b.slug, b.title, b.description, b.icon, b.rule,
            ub.earned_at
     FROM badges b
     LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = $1
     ORDER BY (ub.earned_at IS NULL), b.slug`,
    [userId]
  );
  return NextResponse.json({ badges: res.rows });
}
