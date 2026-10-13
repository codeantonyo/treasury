// Money units, exchange rates and the XLMTREASURY2 price.
// Amounts are bigint "units" of 0.0000001 (7 decimals) in every currency, stored as strings.
import { HORIZON, StellarBusy } from "./stellar.ts";
import { MAIN_TOKEN, type Token } from "./tokens.ts";

export const CURRENCIES = ["XLM", "USD", "EUR", "GBP", "AUD", "CAD", "CHF", "JPY"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (c: string): c is Currency => (CURRENCIES as readonly string[]).includes(c);

export const UNIT = 10_000_000n;
/** "12.5" or 12.5 → 125000000n. Rejects more than 7 decimals, signs and junk. */
export function toUnits(v: string | number): bigint {
  const s = typeof v === "number" ? v.toFixed(7) : v.trim();
  const m = /^(\d+)(?:\.(\d{0,7}))?$/.exec(s);
  if (!m) throw new Error("Enter an amount like 12.50");
  return BigInt(m[1]) * UNIT + BigInt((m[2] ?? "").padEnd(7, "0"));
}
export const fromUnits = (u: bigint | string) => Number(BigInt(u)) / 1e7;

/** Price of 1 XLM in each currency (XLM = 1). */
export type Rates = Record<Currency, number>;

export class RatesUnavailable extends Error {
  constructor() {
    super("Exchange rates are unavailable right now. Please try again in a moment.");
  }
}

let ratesCache: { at: number; rates: Rates } | null = null;

/** Live XLM prices from CoinGecko, cached 60 s. Strict: throws RatesUnavailable, never guesses. */
export async function xlmRates(): Promise<Rates> {
  if (ratesCache && Date.now() - ratesCache.at < 60_000) return ratesCache.rates;
  try {
    const vs = CURRENCIES.filter((c) => c !== "XLM").map((c) => c.toLowerCase()).join(",");
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=${vs}`, { signal: AbortSignal.timeout(8000) });
    const p = (await res.json()).stellar as Record<string, number>;
    const rates = { XLM: 1 } as Rates;
    for (const c of CURRENCIES) if (c !== "XLM") rates[c] = p[c.toLowerCase()];
    if (!CURRENCIES.every((c) => rates[c] > 0)) throw new Error("bad rates");
    ratesCache = { at: Date.now(), rates };
    return rates;
  } catch {
    throw new RatesUnavailable();
  }
}

/** Convert units between currencies. Returns the converted units and the rate used (to per from). */
export function convert(units: bigint, from: Currency, to: Currency, rates: Rates): { units: bigint; rate: number } {
  if (from === to) return { units, rate: 1 };
  const rate = rates[to] / rates[from];
  const scaled = BigInt(Math.round(rate * 1e12));
  return { units: (units * scaled + 500_000_000_000n) / 1_000_000_000_000n, rate };
}

const priceCache = new Map<string, { at: number; xlm: number }>();
const assetQs = (t: Token, side: "selling" | "buying" | "base" | "counter") =>
  `${side}_asset_type=credit_alphanum${t.code.length > 4 ? 12 : 4}&${side}_asset_code=${t.code}&${side}_asset_issuer=${t.issuer}`;

async function getJson(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (r.ok) return r.json();
  } catch {}
  throw new StellarBusy();
}

/**
 * A token's price in XLM: order-book mid; if the spread is over 5% or the book is one-sided,
 * the median of recent trades (at least 3, last 7 days). Never a single odd trade. Cached 60 s.
 */
export async function assetPriceXlm(t: Token): Promise<number> {
  if (t.native) return 1;
  if (!t.issuer) throw new StellarBusy();
  const hit = priceCache.get(t.code);
  if (hit && Date.now() - hit.at < 60_000) return hit.xlm;
  const book = await getJson(`${HORIZON}/order_book?${assetQs(t, "selling")}&buying_asset_type=native&limit=1`);
  const bid = Number(book.bids[0]?.price ?? 0), ask = Number(book.asks[0]?.price ?? 0);
  let xlm = 0;
  if (bid > 0 && ask > 0 && (ask - bid) / ((ask + bid) / 2) <= 0.05) xlm = (ask + bid) / 2;
  else {
    const trades = (await getJson(`${HORIZON}/trades?${assetQs(t, "base")}&counter_asset_type=native&order=desc&limit=25`))._embedded.records as {
      ledger_close_time: string;
      price: { n: string; d: string };
    }[];
    const recent = trades.filter((x) => Date.now() - Date.parse(x.ledger_close_time) < 7 * 86_400_000).map((x) => Number(x.price.n) / Number(x.price.d)).sort((a, b) => a - b);
    if (recent.length < 3) throw new StellarBusy();
    xlm = recent[Math.floor(recent.length / 2)];
  }
  priceCache.set(t.code, { at: Date.now(), xlm });
  return xlm;
}

/** XLMTREASURY2 price in XLM. */
export const tokenPriceXlm = () => assetPriceXlm(MAIN_TOKEN);

// ---------- 7-day history (display only: failures just hide the chart) ----------

const histCache = new Map<string, { at: number; points: [number, number][] }>();
const HOUR = 3_600_000;

/** Hourly XLM/USD for the last 7 days (CoinGecko). */
export async function xlmUsdHistory(): Promise<[number, number][]> {
  const hit = histCache.get("XLM");
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.points;
  const r = await fetch("https://api.coingecko.com/api/v3/coins/stellar/market_chart?vs_currency=usd&days=7", { signal: AbortSignal.timeout(8000) });
  const points = ((await r.json()).prices ?? []) as [number, number][];
  if (points.length < 24) throw new RatesUnavailable();
  histCache.set("XLM", { at: Date.now(), points });
  return points;
}

/** Hourly price of a token in XLM for the last 7 days (Horizon trade candles; quiet hours keep the last price). */
export async function assetXlmHistory(t: Token): Promise<[number, number][]> {
  if (t.native || !t.issuer) return [];
  const hit = histCache.get(t.code);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.points;
  const end = Date.now(), start = end - 7 * 86_400_000;
  const recs = (await getJson(`${HORIZON}/trade_aggregations?${assetQs(t, "base")}&counter_asset_type=native&resolution=${HOUR}&start_time=${start}&end_time=${end}&order=asc&limit=200`))._embedded
    .records as { timestamp: string; close: string }[];
  const points = recs.map((x) => [Number(x.timestamp), Number(x.close)] as [number, number]);
  histCache.set(t.code, { at: Date.now(), points });
  return points;
}
