import "server-only";
import type { User } from "./db";
import { assetPriceXlm, assetXlmHistory, xlmRates, xlmUsdHistory } from "./fx";
import { memberView } from "./member";
import { StellarBusy, walletAssets } from "./stellar";
import { LADDERS, ladderProgress, ladderTier, ladderToNext } from "./tiers";
import { isLive, MAIN_TOKEN, WALLET_TOKENS, type Token } from "./tokens";

export type Holding = {
  code: string;
  name: string;
  orb: string;
  color: string;
  mono: string;
  native: boolean;
  live: boolean;
  issuer: string | null;
  homeDomain: string | null;
  amount: number;
  perWallet: { address: string; amount: number }[];
  priceUsd: number | null;
  valueUsd: number | null;
  change24h: number | null; // fraction, e.g. 0.012 = +1.2%
  spark: number[]; // hourly USD price, last 7 days (downsampled)
  tier: { n: number; of: number; progress: number; toNext: number } | null;
  usd24hAgo: number | null;
};

const DAY = 86_400_000;

/** Token USD series = its hourly XLM price (carried forward through quiet hours) × XLM/USD at that hour. */
function usdSeries(t: Token, xlmUsd: [number, number][], tokenXlm: [number, number][]): [number, number][] {
  if (t.native) return xlmUsd;
  const out: [number, number][] = [];
  let i = -1;
  for (const [at, usd] of xlmUsd) {
    while (i + 1 < tokenXlm.length && tokenXlm[i + 1][0] <= at) i++;
    if (i >= 0) out.push([at, tokenXlm[i][1] * usd]);
  }
  return out;
}

const downsample = (s: number[], max = 56) => (s.length <= max ? s : s.filter((_, i) => i % Math.ceil(s.length / max) === 0 || i === s.length - 1));

/** The member's on-chain portfolio across verified wallets. Display only; nothing here moves money. */
export async function portfolio(user: User) {
  const view = await memberView(user);
  const addresses = view.verified.map((w) => w.address);
  let per: Awaited<ReturnType<typeof walletAssets>> | null = null;
  let busy = false;
  try {
    per = addresses.length ? await walletAssets(addresses) : [];
  } catch (e) {
    if (!(e instanceof StellarBusy)) throw e;
    busy = true;
  }
  const [rates, xlmHist] = await Promise.all([xlmRates().catch(() => null), xlmUsdHistory().catch(() => null)]);
  const now = Date.now();

  const holdings: Holding[] = await Promise.all(
    WALLET_TOKENS.map(async (t) => {
      const live = isLive(t);
      const perWallet = per ? per.map((w) => ({ address: w.address, amount: w.balances[t.code] ?? 0 })) : [];
      // Stellar busy: last known amounts (never shown as 0 just because the read failed).
      const lastKnown = t.native ? (user.lastHolding?.xlm ?? 0) : t.code === MAIN_TOKEN.code ? (user.lastHolding?.amount ?? 0) : 0;
      const amount = per ? perWallet.reduce((s, w) => s + w.amount, 0) : lastKnown;
      const priceXlm = live ? await assetPriceXlm(t).catch(() => null) : null;
      const priceUsd = priceXlm !== null && rates ? priceXlm * rates.USD : null;

      let series: [number, number][] = [];
      if (live && xlmHist) series = usdSeries(t, xlmHist, t.native ? [] : await assetXlmHistory(t).catch(() => []));
      const dayAgo = series.find(([at]) => at >= now - DAY)?.[1] ?? null;
      const last = series.at(-1)?.[1] ?? null;
      const change24h = dayAgo && last ? last / dayAgo - 1 : null;

      return {
        code: t.code,
        name: t.name,
        orb: t.orb,
        color: t.color,
        mono: t.mono,
        native: !!t.native,
        live,
        issuer: t.issuer,
        homeDomain: t.homeDomain ?? null,
        amount,
        perWallet,
        priceUsd,
        valueUsd: priceUsd !== null ? amount * priceUsd : null,
        change24h,
        spark: downsample(series.map(([, v]) => v)),
        tier: LADDERS[t.code] ? { n: ladderTier(LADDERS[t.code], amount), of: LADDERS[t.code].length, progress: ladderProgress(LADDERS[t.code], amount), toNext: ladderToNext(LADDERS[t.code], amount) } : null,
        usd24hAgo: dayAgo,
      };
    }),
  );

  const priced = holdings.filter((h) => h.valueUsd !== null);
  const total = priced.reduce((s, h) => s + h.valueUsd!, 0);
  const totalDayAgo = priced.reduce((s, h) => s + (h.usd24hAgo !== null && h.priceUsd ? h.amount * h.usd24hAgo : h.valueUsd!), 0);
  holdings.sort((a, b) => Number(b.live) - Number(a.live) || (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  return {
    holdings,
    total: priced.length ? total : null,
    change24h: priced.length && totalDayAgo ? total - totalDayAgo : null,
    changePct: priced.length && totalDayAgo ? total / totalDayAgo - 1 : null,
    wallets: view.verified.map((w) => ({ address: w.address, primary: w.primary })),
    busy,
    asOf: busy ? (user.lastHolding?.at ?? null) : now,
  };
}
