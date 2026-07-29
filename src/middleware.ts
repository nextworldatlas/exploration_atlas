// Assigns every visitor a stable anonymous user id (UUID cookie) so completion
// is self-reported per-browser at MVP. Runs before pages and API routes.
import { NextRequest, NextResponse } from "next/server";
import { USER_COOKIE } from "@/lib/user";

export function middleware(request: NextRequest) {
  if (request.cookies.get(USER_COOKIE)) return NextResponse.next();
  const response = NextResponse.next();
  const id = crypto.randomUUID();
  // Make the new id visible to this same request's handlers as well.
  request.cookies.set(USER_COOKIE, id);
  response.cookies.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365 * 5,
    path: "/",
  });
  return response;
}

export const config = {
  // Skip static assets and tiles; everything else needs an identity.
  matcher: ["/((?!_next/static|_next/image|tiles/|favicon.ico).*)"],
};
