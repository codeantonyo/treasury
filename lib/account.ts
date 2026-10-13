import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { db, type Code, type User } from "./db";
import { sendMail } from "./mail";
import { randomCode, sha256 } from "./password";
import { qualify } from "./referrals";
import { boughtSince, totalHolding } from "./stellar";

export const TAG_RE = /^[a-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;
export const MAX_WALLETS = 3;

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
export const newReferralCode = () => "TRSY-" + Array.from(randomBytes(6), (b) => ALPHABET[b % 32]).join("");

export function newUser(o: { email: string; passwordHash: string; name: string; tag: string; referredBy: string | null; device: string | null }): User {
  return {
    id: randomUUID(),
    email: o.email,
    emailVerified: false,
    passwordHash: o.passwordHash,
    name: o.name,
    tag: o.tag,
    avatar: null,
    role: "member",
    referralCode: newReferralCode(),
    referredBy: o.referredBy,
    devices: o.device ? [o.device] : [],
    sessionEpoch: 0,
    failedLogins: 0,
    lockedUntil: null,
    prefs: { hideBalances: false, emailNotifs: true, tgNotifs: true },
    timeZone: null,
    streak: { count: 0, lastDay: null, lastAt: null },
    maxTier: 0,
    lastHolding: null,
    qualifiedReferrals: 0,
    createdAt: Date.now(),
  };
}

/** Store a one-time code/token (hashed) for a user, replacing any earlier one of the same kind. */
export async function saveCode(userId: string, kind: Code["kind"], secret: string, ttlMs: number, extra: Partial<Code> = {}) {
  const id = `${kind}:${userId}`;
  await db.tx(async (t) => {
    if (await t.get("codes", id)) await t.del("codes", id);
    await t.insert("codes", { id, userId, kind, hash: sha256(`${secret}:${userId}`), expiresAt: Date.now() + ttlMs, attempts: 0, ...extra });
  });
}

/** Check a code: max 5 attempts, single use. Returns the code row on success. */
export async function consumeCode(userId: string, kind: Code["kind"], secret: string): Promise<Code | "expired" | "wrong"> {
  return db.tx(async (t) => {
    const c = await t.get("codes", `${kind}:${userId}`);
    if (!c || c.expiresAt < Date.now() || c.attempts >= 5) return "expired";
    if (c.hash !== sha256(`${secret.trim()}:${userId}`)) {
      await t.put("codes", { ...c, attempts: c.attempts + 1 });
      return "wrong";
    }
    await t.del("codes", c.id);
    return c;
  });
}

export async function sendVerification(user: Pick<User, "id" | "email" | "name">, email = user.email, kind: Code["kind"] = "verify-email") {
  const code = randomCode();
  await saveCode(user.id, kind, code, 15 * 60_000, kind === "change-email" ? { newEmail: email } : {});
  const change = kind === "change-email";
  await sendMail(email, {
    subject: `${code} is your XLM TREASURY code`,
    preheader: `Your code is ${code}. It expires in 15 minutes.`,
    title: change ? "Confirm your new email" : "Verify your email",
    name: user.name,
    lines: [change ? "Enter this code in XLM TREASURY to switch your account to this email address." : "Enter this code in XLM TREASURY to verify your email and unlock referral rewards."],
    code,
    footnote: "The code expires in 15 minutes. If you didn't ask for it, you can ignore this email.",
  });
}

export async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** After the response: re-check this member's referral (they may have just qualified). */
export function requalifyLater(userId: string) {
  after(async () => {
    try {
      await qualify(db, userId, { holding: totalHolding, bought: boughtSince });
    } catch {
      // Stellar busy or similar: the cron run picks it up later.
    }
  });
}
