// Referral qualification. A friend counts once, ever, when they:
//   registered with the referrer's code, verified their email, proved a wallet,
//   hold at least Tier 1 (100 XLMTREASURY2) across their verified wallets,
//   and BOUGHT at least 100 on the DEX after signing up (tokens moved in from elsewhere don't count).
// Sign-ups from a device the referrer used are rejected.
// Qualifying queues ONE payout (id "ref:<inviteeId>"); payouts are sent by scripts/pay-referrals.ts.
import type { makeDb } from "./db.ts";
import { MIN_HOLDING } from "./tiers.ts";

export const REFERRAL_REWARDS = [100, 250, 500, 1000]; // then 1000 for every further referral

/** Reward for the referrer's n-th qualified referral (1-based). */
export const rewardFor = (n: number) => REFERRAL_REWARDS[Math.min(n, REFERRAL_REWARDS.length) - 1];

export type QualifyResult =
  | { status: "qualified"; ordinal: number; amount: number }
  | { status: "pending"; waitingFor: "email" | "wallet" | "tier1" | "buy" }
  | { status: "rejected"; reason: string }
  | { status: "none" };

type Db = ReturnType<typeof makeDb>;

/** Strict Stellar reads (they throw if Stellar is busy; nothing is written then). */
export type Chain = {
  holding: (addresses: string[]) => Promise<number>;
  bought: (addresses: string[], since: number) => Promise<number>;
};

/** Check one invitee and, if they qualify, credit the referrer atomically. With dry=true nothing is written. */
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
  const addresses = wallets.map((w) => w.address);
  if ((await chain.holding(addresses)) < MIN_HOLDING) return { status: "pending", waitingFor: "tier1" };
  if ((await chain.bought(addresses, invitee.createdAt)) < MIN_HOLDING) return { status: "pending", waitingFor: "buy" };

  if (dry) return { status: "qualified", ordinal: referrer.qualifiedReferrals + 1, amount: rewardFor(referrer.qualifiedReferrals + 1) };

  return db.tx(async (t) => {
    const r = await t.get("referrals", inviteeId);
    if (r?.status === "qualified") return { status: "qualified" as const, ordinal: r.ordinal!, amount: r.amount! };
    if (r?.status !== "pending") return { status: "none" as const };
    const u = (await t.get("users", r.referrerId))!;
    const ordinal = u.qualifiedReferrals + 1;
    const amount = rewardFor(ordinal);
    const now = Date.now();
    await t.put("users", { ...u, qualifiedReferrals: ordinal });
    await t.put("referrals", { ...r, status: "qualified", ordinal, amount, qualifiedAt: now });
    await t.insert("payouts", {
      id: `ref:${inviteeId}`,
      userId: u.id,
      kind: "referral",
      amount,
      status: "queued",
      memo: `XT-REF-${inviteeId.slice(0, 18)}`, // <= 28 bytes, unique per invitee
      createdAt: now,
    });
    return { status: "qualified" as const, ordinal, amount };
  });
}
