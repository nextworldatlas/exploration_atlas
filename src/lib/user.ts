// Anonymous cookie identity. middleware.ts guarantees the cookie exists before
// any page or API handler runs, so reads here never need to set it. Accounts
// and friends are v2; experiences.user_id is already a UUID so nothing changes
// server-side when real auth lands.
import { cookies } from "next/headers";

export const USER_COOKIE = "nwa_uid";

export async function getUserId(): Promise<string> {
  const store = await cookies();
  const id = store.get(USER_COOKIE)?.value;
  if (!id) {
    // Only reachable if middleware was bypassed (e.g. direct API hit with
    // cookies disabled); treat as an anonymous read-only viewer.
    return "00000000-0000-0000-0000-000000000000";
  }
  return id;
}
