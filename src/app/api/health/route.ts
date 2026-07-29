import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/health → deploy diagnostics: proves the process is up and reports
// database connectivity (error message only — never credentials).
export async function GET() {
  const base = {
    node: process.version,
    databaseUrlSet: !!process.env.DATABASE_URL,
  };
  try {
    const r = await query(`SELECT count(*)::int AS systems FROM systems`);
    return NextResponse.json({ ok: true, ...base, systems: r.rows[0].systems });
  } catch (e) {
    return NextResponse.json(
      { ok: false, ...base, dbError: (e as Error).message },
      { status: 500 }
    );
  }
}
