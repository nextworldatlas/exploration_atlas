import { NextResponse } from "next/server";
import { USER_COOKIE } from "@/lib/user";

// POST /api/auth/logout — issues a fresh anonymous identity.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365 * 5,
    path: "/",
  });
  return res;
}
