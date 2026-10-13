"use server";

import { redirect } from "next/navigation";
import { appUrl, EMAIL_RE, MIN_PASSWORD, newUser, requalifyLater, saveCode, sendVerification, TAG_RE, consumeCode } from "@/lib/account";
import { Conflict, db, type User } from "@/lib/db";
import { hashPassword, randomToken, verifyPassword } from "@/lib/password";
import { currentUser, deviceId, endSession, requireUser, startSession } from "@/lib/session";
import { sendMail } from "@/lib/mail";
import { newTreasury } from "@/lib/treasury";
import type { FormState } from "../ui/form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/");
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function register(_: FormState, f: FormData): Promise<FormState> {
  const name = s(f, "name"), tag = s(f, "tag").toLowerCase().replace(/^@/, ""), email = s(f, "email").toLowerCase();
  const password = String(f.get("password") ?? ""), ref = s(f, "ref").toUpperCase();
  const values = { name, tag, email, ref };

  if (name.length < 2 || name.length > 40) return { error: "Enter your name (2–40 characters).", values };
  if (!TAG_RE.test(tag)) return { error: "Username: 3–20 letters, numbers or _.", values };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", values };
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.`, values };

  const referrer = ref ? (await db.find("users", "referralCode", ref))[0] : null;
  if (ref && !referrer) return { error: "That referral code doesn't exist.", values };

  const user = newUser({ email, name, tag, passwordHash: await hashPassword(password), referredBy: referrer?.id ?? null, device: await deviceId() });
  try {
    await db.tx(async (t) => {
      await t.insert("users", user);
      await t.insert("treasury", newTreasury(user.id)); // every member gets an XLM TREASURY Account
      if (referrer) await t.insert("referrals", { id: user.id, referrerId: referrer.id, status: "pending", createdAt: user.createdAt });
    });
  } catch (e) {
    if (!(e instanceof Conflict)) throw e;
    if (e.key.startsWith("email:")) return { error: "An account with this email already exists. Log in instead.", values };
    if (e.key.startsWith("tag:")) return { error: "That username is taken.", values };
    return { error: "Something clashed. Please try again.", values };
  }
  await sendVerification(user);
  await startSession(user);
  redirect("/verify");
}

export async function login(_: FormState, f: FormData): Promise<FormState> {
  const email = s(f, "email").toLowerCase(), password = String(f.get("password") ?? "");
  const values = { email };
  const user = (await db.find("users", "email", email))[0];

  if (!user) {
    await verifyPassword(password, DUMMY_HASH); // same timing as a wrong password
    return { error: "Email or password is incorrect.", values };
  }
  if (user.lockedUntil && user.lockedUntil > Date.now()) return { error: "Too many attempts. Try again in 15 minutes or reset your password.", values };

  const ok = await verifyPassword(password, user.passwordHash);
  const device = await deviceId();
  const saved = await db.tx(async (t) => {
    const u = (await t.get("users", user.id))!;
    if (!ok) {
      const fails = u.failedLogins + 1;
      return t.put("users", { ...u, failedLogins: fails >= 5 ? 0 : fails, lockedUntil: fails >= 5 ? Date.now() + 15 * 60_000 : u.lockedUntil });
    }
    const devices = device && !u.devices.includes(device) ? [...u.devices, device].slice(-10) : u.devices;
    return t.put("users", { ...u, failedLogins: 0, lockedUntil: null, devices });
  });
  if (!ok) return { error: "Email or password is incorrect.", values };

  await startSession(saved);
  redirect(safeNext(s(f, "next")));
}

export async function forgot(_: FormState, f: FormData): Promise<FormState> {
  const email = s(f, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", values: { email } };
  const user = (await db.find("users", "email", email))[0];
  if (user) {
    const token = randomToken();
    await saveCode(user.id, "reset-password", token, 30 * 60_000);
    const link = `${await appUrl()}/reset?u=${user.id}&t=${token}`;
    await sendMail(user.email, "Reset your XLM TREASURY password", `Hi ${user.name},\n\nReset your password here (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email. Your password stays the same.`);
  }
  return { ok: "If that email has an account, we've sent a reset link. Check your inbox.", values: { email } };
}

export async function resetPassword(_: FormState, f: FormData): Promise<FormState> {
  const uid = s(f, "u"), token = s(f, "t"), password = String(f.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (password !== String(f.get("confirm") ?? "")) return { error: "The passwords don't match." };

  const code = await consumeCode(uid, "reset-password", token);
  if (typeof code === "string") return { error: "This reset link has expired. Ask for a new one." };

  const passwordHash = await hashPassword(password);
  const user = await db.tx(async (t) => {
    const u = (await t.get("users", uid))!;
    // New password signs out every other session; the link proves the email too.
    return t.put("users", { ...u, passwordHash, sessionEpoch: u.sessionEpoch + 1, failedLogins: 0, lockedUntil: null, emailVerified: true });
  });
  await startSession(user);
  redirect("/");
}

export async function verifyEmail(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const code = await consumeCode(user.id, "verify-email", s(f, "code"));
  if (code === "expired") return { error: "That code has expired. Send a new one." };
  if (code === "wrong") return { error: "That code isn't right. Check the email and try again." };
  await setVerified(user);
  requalifyLater(user.id);
  redirect("/");
}

export async function resendVerification(): Promise<FormState> {
  const user = await requireUser();
  if (user.emailVerified) return { ok: "Your email is already verified." };
  await sendVerification(user);
  return { ok: `We sent a new code to ${user.email}.` };
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/** Sign out on every device (bumps the session epoch), keeping this one signed in. */
export async function logoutEverywhere() {
  const me = await currentUser();
  if (!me) redirect("/login");
  const user = await db.tx(async (t) => {
    const u = (await t.get("users", me.id))!;
    return t.put("users", { ...u, sessionEpoch: u.sessionEpoch + 1 });
  });
  await startSession(user);
  redirect("/profile/settings?signedOut=1");
}

async function setVerified(user: User) {
  await db.tx(async (t) => {
    const u = (await t.get("users", user.id))!;
    await t.put("users", { ...u, emailVerified: true });
  });
}
