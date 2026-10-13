// SIMULATED tier rewards (gamification, owner's design, same as NEWBANK). Members collect simulated
// tokens for holding a real token, then withdraw their value to a card as in-app balance.
// They are not on-chain, are never read from or sent to Stellar, and in-app balances can never be
// cashed out. (Assets with the same codes exist on Stellar from an unrelated issuer; these are not them.)

/** A simulated reward asset and the real asset its value follows (1 unit = 1 of that asset). */
export type SimAsset = { code: string; name: string; tracks: string; unit?: string; coingecko: string | null; color: string };

export const SIM_ASSETS: SimAsset[] = [
  { code: "XLM26", name: "XLM26", tracks: "XLM", coingecko: null, color: "#d8d4e6" },
  { code: "XRP26", name: "XRP26", tracks: "XRP", coingecko: "ripple", color: "#9fb7ff" },
  { code: "USDC26", name: "USDC26", tracks: "USDC", coingecko: "usd-coin", color: "#6fb8ff" },
  { code: "XDC26", name: "XDC26", tracks: "XDC", coingecko: "xdce-crowd-sale", color: "#7fe3d0" },
  { code: "GOLD26", name: "GOLD26", tracks: "gold", unit: "oz", coingecko: "pax-gold", color: "#f0d078" },
  { code: "SILVER26", name: "SILVER26", tracks: "silver", unit: "oz", coingecko: "kinesis-silver", color: "#cfd3dc" },
];

export type RewardTier = { n: number; perDay: Record<string, number>; perk: string | null };

const t = (n: number, xlm: number, xrp: number, usdc: number, xdc: number, gold: number, silver: number, perk: string | null = null): RewardTier => ({
  n,
  perDay: { XLM26: xlm, XRP26: xrp, USDC26: usdc, XDC26: xdc, GOLD26: gold, SILVER26: silver },
  perk,
});

/** Per token: what each tier earns per day (owner's table). Tokens not listed have no rewards yet. */
export const REWARD_TABLES: Record<string, RewardTier[]> = {
  PROTOCOL26: [
    t(1, 2_600_000, 260_000, 26_000, 26_000_000, 26, 260),
    t(2, 13_760_000, 1_376_000, 130_600, 130_600_000, 130, 1_360),
    t(3, 26_000_000, 2_600_000, 260_000, 260_000_000, 260, 2_600, "QFS: 2 days earlier"),
    t(4, 52_000_000, 5_200_000, 520_000, 520_000_000, 520, 5_200, "QFS: 5 days earlier"),
    t(5, 104_000_000, 10_400_000, 1_040_000, 1_040_000_000, 1_040, 10_400, "QFS: 10 days earlier"),
    t(6, 508_000_000, 50_800_000, 5_080_000, 5_080_000_000, 5_080, 50_800, "QFS: 18 days earlier"),
  ],
};

/** Per-day amounts for a token at a tier (all zero below Tier 1). */
export function perDayAt(token: string, tier: number): Record<string, number> {
  return REWARD_TABLES[token]?.find((r) => r.n === tier)?.perDay ?? {};
}

export const accrualKey = (token: string, asset: string) => `sim:${token}:${asset}`;

export class SimPricesUnavailable extends Error {
  constructor() {
    super("Reward prices are unavailable right now. Please try again in a moment.");
  }
}

let priceCache: { at: number; usd: Record<string, number> } | null = null;

/** USD price of 1 unit of each simulated asset, from what it tracks. Strict; cached 60 s. */
export async function simPricesUsd(xlmUsd: number): Promise<Record<string, number>> {
  if (!priceCache || Date.now() - priceCache.at > 60_000) {
    const usd: Record<string, number> = {};
    try {
      const ids = SIM_ASSETS.flatMap((a) => (a.coingecko ? [a.coingecko] : [])).join(",");
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { signal: AbortSignal.timeout(8000) });
      const j = (await res.json()) as Record<string, { usd: number }>;
      for (const a of SIM_ASSETS) if (a.coingecko) usd[a.code] = j[a.coingecko]?.usd;
    } catch {
      throw new SimPricesUnavailable();
    }
    if (!SIM_ASSETS.every((a) => !a.coingecko || usd[a.code] > 0)) throw new SimPricesUnavailable();
    priceCache = { at: Date.now(), usd };
  }
  return { ...priceCache.usd, XLM26: xlmUsd };
}
