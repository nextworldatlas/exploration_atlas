import { NextResponse } from "next/server";
import { getUserId } from "@/lib/user";
import { getUsername } from "@/lib/auth";

// GET /api/auth/me → { username: string | null }
export async function GET() {
  const userId = await getUserId();
  return NextResponse.json({ username: await getUsername(userId) });
}
