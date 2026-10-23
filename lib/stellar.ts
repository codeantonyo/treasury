// Horizon reads. Rule: a Horizon failure is never "holds 0". Unfunded account (404) = 0;
// anything else that goes wrong throws StellarBusy so callers can answer "try again".
import { StrKey } from "@stellar/stellar-sdk";
import { MAIN_TOKEN, WALLET_TOKENS, type Token } from "./tokens.ts";

export const HORIZON = process.env.HORIZON_URL ?? "https://horizon.stellar.org";

export class StellarBusy extends Error {
  constructor() {
    super("Stellar is busy right now. Please try again in a moment.");
  }
}

export const isAddress = (a: string) => StrKey.isValidEd25519PublicKey(a);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function horizon(pathOrUrl: string): Promise<Json | null> {
  let res: Response;
  try {
    res = await fetch(pathOrUrl.startsWith("http") ? pathOrUrl : HORIZON + pathOrUrl, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new StellarBusy();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new StellarBusy();
  return res.json();
}

const isToken = (b: Json, t: Token) => b.asset_code === t.code && b.asset_issuer === t.issuer;

/** Main-token balance of one account (0 if unfunded or no trustline). Throws StellarBusy. */
export async function tokenBalance(address: string, token: Token = MAIN_TOKEN): Promise<number> {
  const acc = await horizon(`/accounts/${address}`);
  if (!acc) return 0;
  const b = (acc.balances as Json[]).find((b) => isToken(b, token));
  return b ? Number(b.balance) : 0;
}

/** Every registry token held by each wallet (code → amount). Strict: any failed read fails the whole call. */
export async function walletAssets(addresses: string[]): Promise<{ address: string; balances: Record<string, number> }[]> {
  const accounts = await Promise.all(addresses.map((a) => horizon(`/accounts/${a}`)));
  return addresses.map((address, i) => {
    const balances: Record<string, number> = {};
    for (const b of (accounts[i]?.balances ?? []) as Json[]) {
      const t = WALLET_TOKENS.find((t) => (t.native ? b.asset_type === "native" : t.issuer && isToken(b, t)));
      if (t) balances[t.code] = (balances[t.code] ?? 0) + Number(b.balance);
    }
    return { address, balances };
  });
}

/** XLM and XLMTREASURY2 across wallets, plus how many registry assets they hold. Strict. */
export async function walletBalances(addresses: string[]): Promise<{ xlm: number; token: number; assets: number }> {
  const per = await walletAssets(addresses);
  const total: Record<string, number> = {};
  for (const w of per) for (const [c, n] of Object.entries(w.balances)) total[c] = (total[c] ?? 0) + n;
  return { xlm: total.XLM ?? 0, token: total[MAIN_TOKEN.code] ?? 0, assets: Object.values(total).filter((n) => n > 0).length };
}

/** Sum across wallets. Strict: if any wallet can't be read, the whole read fails. */
export async function totalHolding(addresses: string[], token: Token = MAIN_TOKEN): Promise<number> {
  const all = await Promise.all(addresses.map((a) => tokenBalance(a, token)));
  return all.reduce((s, n) => s + n, 0);
}

/** Does the account have a trustline for the token (needed to receive it)? Throws StellarBusy. */
export async function hasTrustline(address: string, token: Token = MAIN_TOKEN): Promise<boolean> {
  const acc = await horizon(`/accounts/${address}`);
  return !!acc && (acc.balances as Json[]).some((b) => isToken(b, token));
}

/** How long after a proof code is issued its payment still counts (judged by when the payment was made). */
export const PROOF_WINDOW = 24 * 3600_000;
export type ProofCode = { memo: string; at: number };

/**
 * Does this Horizon payment record prove the wallet? At least 1 XLMTREASURY2 (or 1 XLM) from `from`
 * to `treasury`, successful, with the text memo of one of the wallet's codes, made from a minute
 * before that code was issued until PROOF_WINDOW after. The time that counts is the payment's,
 * not when the member taps "verify".
 */
export function isProof(p: Json, o: { treasury: string; from: string; codes: ProofCode[] }): boolean {
  const amountOk = Number(p.amount) >= 1 && (p.asset_type === "native" || (p.asset_code === MAIN_TOKEN.code && p.asset_issuer === MAIN_TOKEN.issuer));
  if (p.type !== "payment" || p.from !== o.from || p.to !== o.treasury || !amountOk || p.transaction_successful === false) return false;
  if (p.transaction?.memo_type !== "text") return false;
  const at = Date.parse(p.created_at);
  return o.codes.some((c) => c.memo === p.transaction.memo && at >= c.at - 60_000 && at <= c.at + PROOF_WINDOW);
}

/**
 * Wallet proof, searched in the member's own payment history (newest first, up to 1,000 payments,
 * back to a minute before the oldest code). Returns the transaction hash or null. Throws StellarBusy.
 */
export async function findProofPayment(o: { treasury: string; from: string; codes: ProofCode[] }): Promise<string | null> {
  if (!o.codes.length) return null;
  const since = Math.min(...o.codes.map((c) => c.at)) - 60_000;
  let url: string | null = `/accounts/${o.from}/payments?order=desc&limit=200&join=transactions`;
  for (let page = 0; url && page < 5; page++) {
    const r = await horizon(url);
    if (!r) return null;
    const recs = r._embedded.records as Json[];
    for (const p of recs) {
      if (Date.parse(p.created_at) < since) return null;
      if (isProof(p, o)) return p.transaction_hash;
    }
    url = recs.length === 200 ? r._links.next.href : null;
  }
  return null;
}

/** Recent payments sent by `from` with text memo `memo` (payout idempotency). */
export async function findSentWithMemo(from: string, memo: string, pages = 3): Promise<string | null> {
  let url: string | null = `/accounts/${from}/payments?order=desc&limit=200&join=transactions`;
  for (let page = 0; url && page < pages; page++) {
    const r = await horizon(url);
    if (!r) return null;
    const recs = r._embedded.records as Json[];
    const hit = recs.find((p) => p.from === from && p.transaction?.memo === memo);
    if (hit) return hit.transaction_hash;
    url = recs.length === 200 ? r._links.next.href : null;
  }
  return null;
}

export type Buy = { account: string; at: number; amount: number; xlm: number };
const buysCache = new Map<string, { at: number; buys: Buy[] }>();

/**
 * Every DEX buy of a token against XLM (order book and path-payment swaps), oldest first.
 * Strict (throws StellarBusy) and cached 5 minutes per token.
 */
export async function tokenBuys(t: Token = MAIN_TOKEN): Promise<Buy[]> {
  const hit = buysCache.get(t.code);
  if (hit && Date.now() - hit.at < 300_000) return hit.buys;
  const pair = `base_asset_type=credit_alphanum${t.code.length > 4 ? 12 : 4}&base_asset_code=${t.code}&base_asset_issuer=${t.issuer}&counter_asset_type=native`;
  const buys: Buy[] = [];
  let url: string | null = `/trades?${pair}&order=asc&limit=200`;
  // ponytail: full scan of the token/XLM market (PROTOCOL26: 3,199 trades / 16 pages in Oct 2026). Keep a cursor in the DB past ~100 pages.
  for (let page = 0; url; page++) {
    if (page === 150) throw new StellarBusy(); // never undercount silently
    const r = await horizon(url);
    if (!r) break;
    const recs = r._embedded.records as Json[];
    for (const x of recs) {
      // base = the token. base_is_seller: the base side sold it, so the counter side bought it.
      const buyer = x.base_is_seller ? x.counter_account : x.base_account;
      if (buyer) buys.push({ account: buyer, at: Date.parse(x.ledger_close_time), amount: Number(x.base_amount), xlm: Number(x.counter_amount) });
    }
    url = recs.length === 200 ? r._links.next.href : null;
  }
  buysCache.set(t.code, { at: Date.now(), buys });
  return buys;
}

/** XLMTREASURY2 bought on the DEX by these wallets at or after `since`. Strict. */
export async function boughtSince(addresses: string[], since: number): Promise<number> {
  const mine = new Set(addresses);
  return (await tokenBuys()).filter((b) => mine.has(b.account) && b.at >= since).reduce((s, b) => s + b.amount, 0);
}

export type Purchase = { amount: number; xlm: number; at: number };

/**
 * These wallets' first XLMTREASURY2 purchase on the DEX at or after `since` that cost at least
 * `minXlm`, or null. Trades in the same ledger count as one purchase (one order filled in pieces). Strict.
 */
export async function firstPurchase(addresses: string[], since: number, minXlm: number): Promise<Purchase | null> {
  const mine = new Set(addresses);
  const byLedger = new Map<number, Purchase>();
  for (const b of await tokenBuys()) {
    if (!mine.has(b.account) || b.at < since) continue;
    const p = byLedger.get(b.at) ?? { amount: 0, xlm: 0, at: b.at };
    p.amount += b.amount;
    p.xlm += b.xlm;
    byLedger.set(b.at, p);
  }
  return [...byLedger.values()].sort((a, b) => a.at - b.at).find((p) => p.xlm >= minXlm) ?? null;
}

/** When these wallets first bought XLMTREASURY2 on the DEX, or null. Strict. */
export async function firstBuy(addresses: string[]): Promise<number | null> {
  const mine = new Set(addresses);
  return (await tokenBuys()).find((b) => mine.has(b.account))?.at ?? null;
}

/**
 * When this account opened its trustline to the token (the earliest it could have held it), from its
 * effects, newest first. Returns null if not found within `pages` pages (very busy accounts). Throws StellarBusy.
 */
export async function trustlineSince(address: string, token: Token, pages = 25): Promise<number | null> {
  let url: string | null = `/accounts/${address}/effects?order=desc&limit=200`;
  for (let page = 0; url && page < pages; page++) {
    const r = await horizon(url);
    if (!r) return null;
    const recs = r._embedded.records as Json[];
    const hit = recs.find((e) => e.type === "trustline_created" && e.asset === `${token.code}:${token.issuer}`);
    if (hit) return Date.parse(hit.created_at);
    url = recs.length === 200 ? r._links.next.href : null;
  }
  return null;
}
