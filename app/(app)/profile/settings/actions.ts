"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { consumeCode, EMAIL_RE, MAX_WALLETS, MIN_PASSWORD, requalifyLater, sendVerification, TAG_RE } from "@/lib/account";
import { Conflict, db, type User } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { requireUser, startSession } from "@/lib/session";
import { findProofPayment, isAddress, PROOF_WINDOW, StellarBusy } from "@/lib/stellar";
import type { FormState } from "../../../ui/form";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function updateMe(fn: (u: User) => User) {
  const me = await requireUser();
  return db.tx(async (t) => t.put("users", fn((await t.get("users", me.id))!)));
}

// ---------- profile ----------

export async function updateProfile(_: FormState, f: FormData): Promise<FormState> {
  const name = s(f, "name"), tag = s(f, "tag").toLowerCase().replace(/^@/, "");
  const values = { name, tag };
  if (name.length < 2 || name.length > 40) return { error: "Name must be 2–40 characters.", values };
  if (!TAG_RE.test(tag)) return { error: "Username: 3–20 letters, numbers or _.", values };
  try {
    await updateMe((u) => ({ ...u, name, tag }));
  } catch (e) {
    if (e instanceof Conflict) return { error: "That username is taken.", values };
    throw e;
  }
  refresh();
  return { ok: "Profile saved.", values };
}

const AVATAR_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/]+=*$/;

export async function saveAvatar(dataUrl: string | null): Promise<{ error?: string }> {
  if (dataUrl !== null && (!AVATAR_RE.test(dataUrl) || dataUrl.length > 200_000)) return { error: "That image couldn't be used. Try another photo." };
  await updateMe((u) => ({ ...u, avatar: dataUrl }));
  refresh();
  return {};
}

// ---------- email & password ----------

export async function changePassword(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireUser();
  const current = String(f.get("current") ?? ""), next = String(f.get("next") ?? "");
  if (!(await verifyPassword(current, me.passwordHash))) return { error: "Your current password isn't right." };
  if (next.length < MIN_PASSWORD) return { error: `New password must be at least ${MIN_PASSWORD} characters.` };
  if (next !== String(f.get("confirm") ?? "")) return { error: "The new passwords don't match." };
  const passwordHash = await hashPassword(next);
  const user = await updateMe((u) => ({ ...u, passwordHash, sessionEpoch: u.sessionEpoch + 1 }));
  await startSession(user); // keep this device signed in
  return { ok: "Password changed. Your other devices were signed out." };
}

export async function requestEmailChange(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireUser();
  const email = s(f, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address.", values: { email } };
  if (email === me.email) return { error: "That's already your email.", values: { email } };
  if (!(await verifyPassword(String(f.get("password") ?? ""), me.passwordHash))) return { error: "Your password isn't right.", values: { email } };
  if ((await db.find("users", "email", email)).length) return { error: "Another account uses that email.", values: { email } };
  await sendVerification(me, email, "change-email");
  return { ok: `We sent a 6-digit code to ${email}.`, values: { email, step: "code" } };
}

export async function confirmEmailChange(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireUser();
  const code = await consumeCode(me.id, "change-email", s(f, "code"));
  if (code === "expired") return { error: "That code has expired. Start again." };
  if (code === "wrong") return { error: "That code isn't right.", values: { step: "code", email: s(f, "email") } };
  try {
    await updateMe((u) => ({ ...u, email: code.newEmail!, emailVerified: true }));
  } catch (e) {
    if (e instanceof Conflict) return { error: "Another account took that email meanwhile." };
    throw e;
  }
  requalifyLater(me.id);
  refresh();
  return { ok: `Your email is now ${code.newEmail}.` };
}

// ---------- preferences ----------

const PREFS = ["hideBalances", "emailNotifs", "tgNotifs"] as const;

export async function setPref(key: (typeof PREFS)[number], value: boolean) {
  if (!PREFS.includes(key)) return;
  await updateMe((u) => ({ ...u, prefs: { ...u.prefs, [key]: value } }));
  refresh();
}

// ---------- wallets ----------

const newMemo = () => "XT-" + randomBytes(4).toString("hex").toUpperCase().slice(0, 6);

export async function addWallet(_: FormState, f: FormData): Promise<FormState> {
  const me = await requireUser();
  const address = s(f, "address").toUpperCase();
  if (!isAddress(address)) return { error: "That isn't a Stellar public address. It starts with G and is 56 characters long.", values: { address } };
  const mine = await db.find("wallets", "userId", me.id);
  if (mine.length >= MAX_WALLETS) return { error: `You can link up to ${MAX_WALLETS} wallets. Remove one first.`, values: { address } };
  if ((await db.find("wallets", "address", address)).some((w) => w.status === "verified" && w.userId !== me.id))
    return { error: "This wallet is already linked to another account.", values: { address } };
  try {
    await db.tx(async (t) => {
      const count = (await t.find("wallets", "userId", me.id)).length;
      if (count >= MAX_WALLETS) throw new Conflict("max-wallets");
      await t.insert("wallets", {
        id: randomUUID(), userId: me.id, address, primary: count === 0, status: "pending",
        memo: newMemo(), memoAt: Date.now(), proofTx: null, createdAt: Date.now(), verifiedAt: null,
      });
    });
  } catch (e) {
    if (e instanceof Conflict) return { error: e.key === "max-wallets" ? `You can link up to ${MAX_WALLETS} wallets.` : "You already added this wallet.", values: { address } };
    throw e;
  }
  refresh();
  return { ok: "Wallet added. Send the small proof payment below to verify it." };
}

export async function renewProof(id: string) {
  const me = await requireUser();
  await db.tx(async (t) => {
    const w = await t.get("wallets", id);
    // Keep the old code: a payment already sent with it still proves the wallet.
    if (w?.userId === me.id && w.status === "pending")
      await t.put("wallets", { ...w, memo: newMemo(), memoAt: Date.now(), oldMemos: [...(w.oldMemos ?? []), { memo: w.memo, at: w.memoAt }].slice(-10) });
  });
  refresh();
}

export async function verifyWallet(id: string): Promise<{ error?: string; ok?: string }> {
  const me = await requireUser();
  const w = await db.get("wallets", id);
  if (!w || w.userId !== me.id) return { error: "Wallet not found." };
  if (w.status === "verified") return { ok: "Already verified." };
  const treasury = process.env.TREASURY_ADDRESS;
  if (!treasury) return { error: "Wallet verification isn't switched on yet. Please try again later." };

  // Look for the payment first: what counts is when it was sent, not when "verify" is tapped.
  let tx: string | null;
  try {
    tx = await findProofPayment({ treasury, from: w.address, codes: [...(w.oldMemos ?? []), { memo: w.memo, at: w.memoAt }] });
  } catch (e) {
    if (e instanceof StellarBusy) return { error: e.message };
    throw e;
  }
  if (!tx && Date.now() > w.memoAt + PROOF_WINDOW) return { error: "This code expired (24 hours). Get a new code and send the payment again." };
  if (!tx) return { error: "We can't see the payment yet. Check the amount and memo, wait a few seconds and try again." };
  return markVerified(me.id, id, tx);
}

/** Local development only: verify without a payment, to test with real public wallets. */
export async function devVerifyWallet(id: string): Promise<{ error?: string; ok?: string }> {
  if (process.env.NODE_ENV !== "development" || process.env.POSTGRES_URL) return { error: "Not available." };
  const me = await requireUser();
  return markVerified(me.id, id, "dev");
}

async function markVerified(userId: string, id: string, proofTx: string) {
  try {
    await db.tx(async (t) => {
      const w = (await t.get("wallets", id))!;
      const all = await t.find("wallets", "userId", userId);
      const hasPrimary = all.some((x) => x.primary && x.status === "verified" && x.id !== id);
      if (!hasPrimary) for (const x of all) if (x.primary && x.id !== id) await t.put("wallets", { ...x, primary: false });
      await t.put("wallets", { ...w, status: "verified", proofTx, verifiedAt: Date.now(), primary: !hasPrimary });
    });
  } catch (e) {
    if (e instanceof Conflict) return { error: "This wallet was already verified by another account." };
    throw e;
  }
  requalifyLater(userId);
  refresh();
  return { ok: "Wallet verified." };
}

export async function makePrimary(id: string) {
  const me = await requireUser();
  await db.tx(async (t) => {
    const all = await t.find("wallets", "userId", me.id);
    const target = all.find((w) => w.id === id);
    if (!target || target.status !== "verified") return;
    for (const w of all) if (w.primary !== (w.id === id)) await t.put("wallets", { ...(await t.get("wallets", w.id))!, primary: w.id === id });
  });
  refresh();
}

export async function removeWallet(id: string) {
  const me = await requireUser();
  await db.tx(async (t) => {
    const w = await t.get("wallets", id);
    if (!w || w.userId !== me.id) return;
    await t.del("wallets", id);
    if (w.primary) {
      const rest = (await t.find("wallets", "userId", me.id)).sort((a, b) => Number(b.status === "verified") - Number(a.status === "verified") || a.createdAt - b.createdAt);
      if (rest[0]) await t.put("wallets", { ...rest[0], primary: true });
    }
  });
  refresh();
}
