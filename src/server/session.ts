import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { createUser, getUser } from "./letters";

/**
 * Accounts are anonymous for now: a signed, httpOnly cookie identifies the
 * browser. Linking Telegram ties reminders to that account.
 */
const COOKIE = "kp_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (at least 32 characters).");
  return "dev-only-secret-do-not-use-in-production-0000";
}

export function sign(userId: string): string {
  const mac = createHmac("sha256", secret()).update(userId).digest("base64url");
  return `${userId}.${mac}`;
}

export function unsign(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const userId = value.slice(0, dot);
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(value);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}

/** The current user's id, or null. Safe to call from Server Components. */
export async function currentUserId(): Promise<string | null> {
  const id = unsign((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  return (await getUser(await getDb(), id)) ? id : null;
}

/** Like currentUserId, but creates an account on first use. Only call from Route Handlers or Server Actions. */
export async function requireUserId(): Promise<string> {
  const existing = await currentUserId();
  if (existing) return existing;
  const id = await createUser(await getDb());
  (await cookies()).set(COOKIE, sign(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}
