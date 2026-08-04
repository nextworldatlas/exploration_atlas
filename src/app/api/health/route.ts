import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/health → deploy diagnostics: proves the process is up and reports
// database connectivity. Connection details are reported in a non-secret
// shape (host/user/db plus password length and a short hash) so a mismatched
// credential can be identified without ever exposing it.
function describeConnection() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return { databaseUrlSet: false };
  try {
    const url = new URL(raw);
    const password = decodeURIComponent(url.password);
    return {
      databaseUrlSet: true,
      host: url.hostname,
      port: url.port,
      user: url.username,
      database: url.pathname.replace(/^\//, ""),
      params: url.search,
      passwordLength: password.length,
      passwordFingerprint: createHash("sha256").update(password).digest("hex").slice(0, 8),
      rawLength: raw.length,
    };
  } catch {
    return { databaseUrlSet: true, parseError: true, rawLength: raw.length };
  }
}

export async function GET() {
  const base = { node: process.version, ...describeConnection() };
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
