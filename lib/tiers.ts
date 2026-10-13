import { shortNum } from "./currencies.ts";
// XLMTREASURY2 tier table (owner's sheet). Balances are XLMTREASURY2 held across verified wallets.
// Tier N starts just above tier N-1's top (e.g. 500.0000001 is Tier 2). Tier 12 starts at exactly 400,000.

export const ALLOCATION_ASSETS = [
  "XLM Stablecoin",
  "Native",
  "Ultrametal",
  "Ultra Stockpool",
  "Ultra Bondspool",
  "Ultra Fundpool",
  "Ultra Rarearths",
] as const;

export type Tier = {
  n: number;
  from: number; // display lower bound
  to: number | null; // inclusive upper bound; null = open
  swapPct: number; // % of Stellar assets available for swap
  allocation: number[]; // per ALLOCATION_ASSETS
};

const row = (n: number, from: number, to: number | null, swapPct: number, stable: number, rest: number): Tier => ({
  n,
  from,
  to,
  swapPct,
  allocation: [stable, ...Array(6).fill(rest)],
});

export const TIERS: Tier[] = [
  row(1, 100, 500, 0, 1, 1),
  row(2, 501, 1_000, 0, 2, 2),
  row(3, 1_001, 2_500, 1, 5, 5),
  row(4, 2_501, 5_000, 6, 15, 10),
  row(5, 5_001, 10_000, 12, 50, 35),
  row(6, 10_001, 20_000, 20, 150, 100),
  row(7, 20_001, 50_000, 35, 500, 350),
  row(8, 50_001, 100_000, 50, 1_500, 1_000),
  row(9, 100_001, 200_000, 65, 5_000, 3_500),
  row(10, 200_001, 300_000, 80, 15_000, 10_000),
  row(11, 300_001, 400_000, 90, 30_000, 20_000),
  row(12, 400_000, null, 100, 100_000, 70_000),
];

export const MIN_HOLDING = TIERS[0].from;

export const tier = (n: number) => TIERS.find((t) => t.n === n);

// ---------- ladders for every token with tiers ----------

/** A tier range as the token project publishes it ("501 – 1,000", "400,000+"). */
export type Rung = { n: number; from: number; to: number | null };

const ladder = (rows: [number, number | null][]): Rung[] => rows.map(([from, to], i) => ({ n: i + 1, from, to }));

export const LADDERS: Record<string, Rung[]> = {
  XLMTREASURY2: TIERS.map(({ n, from, to }) => ({ n, from, to })),
  XLMRWA: ladder([
    [100, 500], [501, 1_000], [1_001, 2_500], [2_501, 5_000], [5_001, 10_000], [10_001, 20_000],
    [20_001, 50_000], [50_001, 100_000], [100_001, 200_000], [200_001, 300_000], [300_001, 400_000], [400_001, null],
  ]),
  STELLARUSD: ladder([
    [1e6, 5e6], [5e6, 1e7], [1e7, 2.5e7], [2.5e7, 5e7], [5e7, 1e8], [1e8, 2.5e8],
    [2.5e8, 5e8], [5e8, 1e9], [1e9, 2e9], [2e9, 3e9], [3e9, 4e9], [4e9, null],
  ]),
  PROTOCOL26: ladder([[1, 49_999], [50_000, 199_999], [200_000, 499_999], [500_000, 1_499_999], [1_500_000, 4_999_999], [5_000_000, null]]),
};

/**
 * Where a rung starts. Published ranges come in two styles: with a gap ("1 – 500", "501 – 1,000")
 * the next tier starts just above the previous top (500.5 is Tier 2); when they touch
 * ("1M – 5M", "5M – 10M") the shared boundary belongs to the higher tier.
 */
const reached = (l: Rung[], i: number, balance: number) => {
  const prevTo = i > 0 ? l[i - 1].to : null;
  return prevTo !== null && prevTo < l[i].from ? balance > prevTo : balance >= l[i].from;
};

/** Tier number for a balance on a ladder, or 0 for "No tier". */
export function ladderTier(l: Rung[], balance: number): number {
  for (let i = l.length - 1; i >= 0; i--) if (reached(l, i, balance)) return l[i].n;
  return 0;
}

/** Amount still needed to reach the next rung (0 at the top). */
export function ladderToNext(l: Rung[], balance: number): number {
  const n = ladderTier(l, balance);
  if (n === l.length) return 0;
  const prevTo = n > 0 ? l[n - 1].to : null;
  const target = prevTo !== null && prevTo < l[n].from ? prevTo + 1e-7 : l[n].from;
  return Math.max(0, Math.round((target - balance) * 1e7) / 1e7);
}

/** 0..1 progress from the current rung's start to the next one (1 at the top). */
export function ladderProgress(l: Rung[], balance: number): number {
  const n = ladderTier(l, balance);
  if (n === l.length) return 1;
  const lo = n === 0 ? 0 : l[n - 1].from;
  const hi = balance + ladderToNext(l, balance);
  return hi > lo ? Math.min(1, Math.max(0, (balance - lo) / (hi - lo))) : 0;
}

// XLMTREASURY2 shortcuts (used across the app)
export const tierFor = (balance: number) => ladderTier(LADDERS.XLMTREASURY2, balance);
export const toNextTier = (balance: number) => ladderToNext(LADDERS.XLMTREASURY2, balance);
export const tierProgress = (balance: number) => ladderProgress(LADDERS.XLMTREASURY2, balance);

/** Whole days since a timestamp. */
export const daysSince = (ms: number, now = Date.now()) => Math.floor((now - ms) / 86_400_000);

/** Amounts and tier ranges; from a million up trimmed ("100M", "2.5B"). */
export const fmt = (n: number, max = 2) => shortNum(n, max);
