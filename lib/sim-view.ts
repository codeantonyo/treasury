import "server-only";
import { db, type User } from "./db";
import type { Holding } from "./portfolio";
import { accrualKey, perDayAt, REWARD_TABLES, SIM_ASSETS, simPricesUsd } from "./sim-rewards";
import { StellarBusy, tokenBuys, trustlineSince } from "./stellar";
import { WALLET_TOKENS } from "./tokens";
import { ensureTreasury, touchFlatAccruals } from "./treasury";
import { xlmRates } from "./fx";

/**
 * When the member first held a token: the earliest trustline among the verified wallets holding it.
 * Looked up once per wallet and saved. A wallet that never bought on the market and is too busy to
 * search falls back to the day it was verified (shown as approximate).
 */
export async function heldSince(userId: string, code: string, holders: string[]): Promise<{ at: number; exact: boolean } | null> {
  const token = WALLET_TOKENS.find((t) => t.code === code);
  if (!token?.issuer || !holders.length) return null;
  const wallets = (await db.find("wallets", "userId", userId)).filter((w) => w.status === "verified" && holders.includes(w.address));
  const found: { at: number; exact: boolean }[] = [];
  for (const w of wallets) {
    let since = w.heldSince?.[code];
    if (!since) {
      try {
        // The earlier of: its trustline (quick look, fine for quiet wallets) and its first market buy.
        const [line, buys] = await Promise.all([trustlineSince(w.address, token, 10), tokenBuys(token)]);
        const firstBuy = buys.find((b) => b.account === w.address)?.at ?? null;
        const known = [line, firstBuy].filter((x): x is number => x !== null);
        since = known.length ? { at: Math.min(...known), exact: true } : { at: w.verifiedAt ?? w.createdAt, exact: false };
        const saved = since;
        await db.tx(async (t) => {
          const cur = await t.get("wallets", w.id);
          if (cur) await t.put("wallets", { ...cur, heldSince: { ...cur.heldSince, [code]: saved } });
        });
      } catch (e) {
        if (!(e instanceof StellarBusy)) throw e;
        since = { at: w.verifiedAt ?? w.createdAt, exact: false }; // not saved: looked up again next time
      }
    }
    found.push(since);
  }
  return found.length ? found.reduce((a, b) => (b.at < a.at ? b : a)) : null;
}

/** Simulated rewards for one token: running totals (advanced and saved on this read), rates and prices. */
export async function simRewardsView(user: User, h: Holding, busy: boolean) {
  const table = REWARD_TABLES[h.code];
  if (!table) return null;
  const tier = h.tier?.n ?? 0;
  const holders = h.perWallet.filter((w) => w.amount > 0).map((w) => w.address);
  const start = await heldSince(user.id, h.code, holders);
  const perDay = perDayAt(h.code, tier);
  const now = Date.now();
  const accruals = busy
    ? (await ensureTreasury(db, user.id)).accruals // Stellar busy: don't move totals on an unknown tier
    : await touchFlatAccruals(db, user.id, SIM_ASSETS.map((a) => ({ key: accrualKey(h.code, a.code), perDay: perDay[a.code] ?? 0 })), start?.at ?? null, now);
  const rates = await xlmRates().catch(() => null);
  const prices = rates ? await simPricesUsd(rates.USD).catch(() => null) : null;
  return {
    token: h.code,
    tier,
    table,
    start,
    serverNow: now,
    ticking: !busy,
    rates,
    assets: SIM_ASSETS.map((a) => {
      const acc = accruals[accrualKey(h.code, a.code)];
      const ready = acc ? BigInt(acc.accrued) - BigInt(acc.collected) : 0n;
      return { code: a.code, tracks: a.tracks, unit: a.unit ?? null, color: a.color, perDay: perDay[a.code] ?? 0, ready: ready.toString(), priceUsd: prices?.[a.code] ?? null };
    }),
  };
}

export type SimView = NonNullable<Awaited<ReturnType<typeof simRewardsView>>>;
