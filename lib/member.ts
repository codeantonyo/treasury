import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { db, type User, type Wallet } from "./db";
import { StellarBusy, walletBalances } from "./stellar";
import { tierFor } from "./tiers";

export type MemberView = {
  wallets: Wallet[];
  verified: Wallet[];
  /** XLMTREASURY2 across verified wallets: live, or the last good read when Stellar is busy. */
  holding: number;
  /** Native XLM across verified wallets (null if unknown because Stellar is busy). */
  xlm: number | null;
  assets: number;
  tier: number;
  /** When the member first verified a wallet: rewards accrue from here. */
  linkedAt: number | null;
  /** Stellar couldn't be read just now; `holding` is the last known value from `asOf`. */
  stale: boolean;
  asOf: number | null;
};

/** Wallets + live holding for a member. Never shows a lower tier just because Horizon failed. Cached per request. */
export const memberView = cache(async (user: User): Promise<MemberView> => {
  const wallets = (await db.find("wallets", "userId", user.id)).sort((a, b) => a.createdAt - b.createdAt);
  const verified = wallets.filter((w) => w.status === "verified");
  const linkedAt = verified.length ? Math.min(...verified.map((w) => w.verifiedAt ?? w.createdAt)) : null;
  if (!verified.length) return { wallets, verified, holding: 0, xlm: 0, assets: 0, tier: 0, linkedAt, stale: false, asOf: null };

  try {
    const b = await walletBalances(verified.map((w) => w.address));
    const tier = tierFor(b.token);
    after(() => remember(user.id, b.token, b.xlm, tier));
    return { wallets, verified, holding: b.token, xlm: b.xlm, assets: b.assets, tier, linkedAt, stale: false, asOf: Date.now() };
  } catch (e) {
    if (!(e instanceof StellarBusy)) throw e;
    const last = user.lastHolding;
    return {
      wallets, verified, holding: last?.amount ?? 0, xlm: last?.xlm ?? null, assets: 0,
      tier: tierFor(last?.amount ?? 0), linkedAt, stale: true, asOf: last?.at ?? null,
    };
  }
});

async function remember(userId: string, amount: number, xlm: number, tier: number) {
  await db.tx(async (t) => {
    const u = await t.get("users", userId);
    if (u) await t.put("users", { ...u, lastHolding: { amount, xlm, at: Date.now() }, maxTier: Math.max(u.maxTier, tier) });
  });
}
