import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/user";
import { signup } from "@/lib/auth";

// POST /api/auth/signup { username, password } — claims the current
// anonymous id as an account; existing progress carries over.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const userId = await getUserId();
  const result = await signup(userId, username, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, username });
}
