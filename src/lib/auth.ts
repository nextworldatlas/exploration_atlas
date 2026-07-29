// Minimal username+password auth (MVP). scrypt from node:crypto — no new
// dependencies. Friends/social stay v2; this exists so progress survives
// cookie clears and follows the user across devices once deployed.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { query } from "./db";

export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export async function getUsername(userId: string): Promise<string | null> {
  const res = await query(`SELECT username FROM users WHERE id = $1`, [userId]);
  return res.rows[0]?.username ?? null;
}

// Claim the current anonymous id as an account. Existing progress rows
// already point at this UUID, so they become the account's history.
export async function signup(
  userId: string,
  username: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: "Username must be 3–20 letters, digits, - or _" };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }
  const existing = await query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
  if (existing.rowCount) {
    return { ok: false, error: "This browser is already signed in to an account" };
  }
  try {
    await query(`INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`, [
      userId,
      username,
      hashPassword(password),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return { ok: false, error: "That username is taken" };
    }
    throw e;
  }
  return { ok: true };
}

export async function login(
  username: string,
  password: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const res = await query(
    `SELECT id, password_hash FROM users WHERE lower(username) = lower($1)`,
    [username]
  );
  const row = res.rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    return { ok: false, error: "Wrong username or password" };
  }
  return { ok: true, userId: row.id };
}
