// Referrals (owner's rule, 2026-10-23): when an invited friend makes their FIRST purchase of
// XLMTREASURY2 on the DEX after signing up, worth at least 100 XLM, the referrer AND the friend each get
// 200% of the tokens bought ("buy 500, you both get 1,000"). One bonus per friend, ever.
// The friend must also have registered with the code, verified their email and proved a wallet.
// Sign-ups from a device the referrer used are rejected.
// Qualifying queues two payouts: "ref:<friend>" (referrer) and "refb:<friend>" (friend), sent by
// lib/payouts.ts (7-day holding period, daily limit, never twice).
import type { makeDb, Payout, Referral } from "./db.ts";
import type { Purchase } from "./stellar.ts";

export const BONUS_MULTIPLIER = 2; // 200%
export const MIN_PURCHASE_XLM = 100;

/** The bonus each side gets for a purchase, in XLMTREASURY2 (7 decimals, Stellar's precision). */
export const bonusFor = (purchased: number) => Math.round(purchased * BONUS_MULTIPLIER * 1e7) / 1e7;

export type QualifyResult =
  | { status: "qualified"; ordinal: number; amount: number }
  | { status: "pending"; waitingFor: "email" | "wallet" | "buy" }
  | { status: "rejected"; reason: string }
  | { status: "none" };

type Db = ReturnType<typeof makeDb>;

/** Strict Stellar reads (they throw if Stellar is busy; nothing is written then). */
export type Chain = {
  /** First XLMTREASURY2 DEX purchase of these wallets at/after `since` worth ≥ `minXlm` XLM. */
  firstPurchase: (addresses: string[], since: number, minXlm: number) => Promise<Purchase | null>;
};

const payoutRows = (r: Referral, referrerId: string, purchase: Purchase, now: number): Payout[] => [
  { id: `ref:${r.id}`, userId: referrerId, kind: "referral", amount: bonusFor(purchase.amount), status: "queued", memo: `XT-REF-${r.id.slice(0, 18)}`, createdAt: now },
  { id: `refb:${r.id}`, userId: r.id, kind: "referral-bonus", amount: bonusFor(purchase.amount), status: "queued", memo: `XT-RFB-${r.id.slice(0, 18)}`, createdAt: now },
];

/** Check one invitee and, if they qualify, queue both bonuses atomically. With dry=true nothing is written. */
export async function qualify(db: Db, inviteeId: string, chain: Chain, dry = false): Promise<QualifyResult> {
  const ref = await db.get("referrals", inviteeId);
  if (!ref) return { status: "none" };
  if (ref.status === "qualified") return { status: "qualified", ordinal: ref.ordinal!, amount: ref.amount! };
  if (ref.status === "rejected") return { status: "rejected", reason: ref.reason ?? "" };

  const [invitee, referrer] = await Promise.all([db.get("users", inviteeId), db.get("users", ref.referrerId)]);
  if (!invitee || !referrer) return { status: "none" };

  const sharedDevice = invitee.devices[0] && referrer.devices.includes(invitee.devices[0]);
  if (sharedDevice) {
    if (!dry) await db.tx(async (t) => {
      const r = await t.get("referrals", inviteeId);
      if (r?.status === "pending") await t.put("referrals", { ...r, status: "rejected", reason: "same device as referrer" });
    });
    return { status: "rejected", reason: "same device as referrer" };
  }
  if (!invitee.emailVerified) return { status: "pending", waitingFor: "email" };

  const wallets = (await db.find("wallets", "userId", inviteeId)).filter((w) => w.status === "verified");
  if (!wallets.length) return { status: "pending", waitingFor: "wallet" };
  const purchase = await chain.firstPurchase(wallets.map((w) => w.address), invitee.createdAt, MIN_PURCHASE_XLM);
  if (!purchase) return { status: "pending", waitingFor: "buy" };

  if (dry) return { status: "qualified", ordinal: referrer.qualifiedReferrals + 1, amount: bonusFor(purchase.amount) };

  return db.tx(async (t) => {
    const r = await t.get("referrals", inviteeId);
    if (r?.status === "qualified") return { status: "qualified" as const, ordinal: r.ordinal!, amount: r.amount! };
    if (r?.status !== "pending") return { status: "none" as const };
    const u = (await t.get("users", r.referrerId))!;
    const ordinal = u.qualifiedReferrals + 1;
    const now = Date.now();
    await t.put("users", { ...u, qualifiedReferrals: ordinal });
    await t.put("referrals", { ...r, status: "qualified", ordinal, amount: bonusFor(purchase.amount), purchase, rule: "bonus200", qualifiedAt: now });
    for (const p of payoutRows(r, u.id, purchase, now)) await t.insert("payouts", p);
    return { status: "qualified" as const, ordinal, amount: bonusFor(purchase.amount) };
  });
}

export type ConvertResult = "converted" | "back-to-pending" | "kept" | "skip";

/**
 * One-off for referrals that qualified under the old 100/250/500/1,000 ladder: if their reward hasn't
 * been sent, it is recalculated with the 200% rule (owner's decision). A friend without a qualifying
 * purchase goes back to pending. A reward already sent is kept as it was.
 */
export async function convertOld(db: Db, inviteeId: string, chain: Chain, dry = false): Promise<ConvertResult> {
  const ref = await db.get("referrals", inviteeId);
  if (!ref || ref.status !== "qualified" || ref.rule) return "skip";
  const old = await db.get("payouts", `ref:${inviteeId}`);
  if (old && old.status !== "queued") {
    if (!dry) await db.tx(async (t) => {
      const r = await t.get("referrals", inviteeId);
      if (r && !r.rule) await t.put("referrals", { ...r, rule: "ladder" });
    });
    return "kept";
  }
  const invitee = await db.get("users", inviteeId);
  const wallets = (await db.find("wallets", "userId", inviteeId)).filter((w) => w.status === "verified");
  const purchase = invitee && wallets.length ? await chain.firstPurchase(wallets.map((w) => w.address), invitee.createdAt, MIN_PURCHASE_XLM) : null;
  if (dry) return purchase ? "converted" : "back-to-pending";

  return db.tx(async (t) => {
    const r = await t.get("referrals", inviteeId);
    const p = await t.get("payouts", `ref:${inviteeId}`);
    if (!r || r.status !== "qualified" || r.rule || (p && p.status !== "queued")) return "skip" as const;
    if (p) await t.del("payouts", p.id);
    if (!purchase) {
      const u = (await t.get("users", r.referrerId))!;
      await t.put("users", { ...u, qualifiedReferrals: Math.max(0, u.qualifiedReferrals - 1) });
      await t.put("referrals", { ...r, status: "pending", ordinal: undefined, amount: undefined, qualifiedAt: undefined });
      return "back-to-pending" as const;
    }
    const now = Date.now();
    await t.put("referrals", { ...r, amount: bonusFor(purchase.amount), purchase, rule: "bonus200", qualifiedAt: r.qualifiedAt ?? now });
    for (const row of payoutRows(r, r.referrerId, purchase, now)) await t.insert("payouts", row);
    return "converted" as const;
  });
}
