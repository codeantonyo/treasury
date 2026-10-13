import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db, type User } from "./db";

// Session = HMAC-signed httpOnly cookie "<userId>.<epoch>.<expires>.<sig>".
// Bumping user.sessionEpoch invalidates every session of that user ("sign out everywhere").
const COOKIE = "xt_session";
export const DEVICE_COOKIE = "xt_did";
const MAX_AGE = 30 * 24 * 3600;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return "dev-only-session-secret";
  throw new Error("SESSION_SECRET is not set");
}
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

/**
 * Production: SameSite=None + Partitioned so the session also works inside Telegram Web, where the
 * Mini App runs in a cross-site iframe. CSRF: server actions only accept same-origin requests.
 */
export const cookieMode = () =>
  process.env.NODE_ENV === "production" ? ({ secure: true, sameSite: "none", partitioned: true } as const) : ({ secure: false, sameSite: "lax" } as const);

export async function startSession(user: User) {
  const body = `${user.id}.${user.sessionEpoch}.${Date.now() + MAX_AGE * 1000}`;
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    ...cookieMode(),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, or null. Checks signature, expiry and epoch. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  await connection(); // per-request: reads the clock and the database
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  const body = raw.slice(0, i), sig = Buffer.from(raw.slice(i + 1));
  const want = Buffer.from(sign(body));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  const [id, epoch, exp] = body.split(".");
  if (Date.now() > Number(exp)) return null;
  const user = await db.get("users", id);
  return user && user.sessionEpoch === Number(epoch) ? user : null;
});

/** For pages and actions that need a member: redirects to /login otherwise. */
export async function requireUser(): Promise<User> {
  return (await currentUser()) ?? redirect("/login");
}

export async function deviceId() {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
}
