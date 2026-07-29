import { NextRequest, NextResponse } from "next/server";
import { USER_COOKIE } from "@/lib/user";
import { login } from "@/lib/auth";

// POST /api/auth/login { username, password } — points this browser's
// identity cookie at the account's UUID.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await login(String(body.username ?? ""), String(body.password ?? ""));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_COOKIE, result.userId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365 * 5,
    path: "/",
  });
  return res;
}
