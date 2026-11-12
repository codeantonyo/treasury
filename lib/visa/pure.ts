// StellarPay Visa: the pure rules (no network, no database), shared by the server and
// scripts/check-visa.ts. Ported from NEWBANK's production card system, including the fixes for
// the bugs that cost it money. Member-facing text never names the card issuer.

// ---------- issuer replies ----------

export interface WlResult<T = Record<string, unknown>> {
  ok: boolean;
  /** HTTP 202 / pending:true: money moved and the outcome is unconfirmed. NEVER retry. */
  pending?: boolean;
  status: number;
  message: string;
  data: T;
}

/** Classify a parsed reply. 202 or pending:true = charged, don't retry. Only a clean 4xx means nothing was charged. */
export function classifyWl<T>(status: number, json: Record<string, unknown>): WlResult<T> {
  const message = typeof json.message === "string" ? json.message : json.success === true ? "OK" : `Card issuer error (${status})`;
  if (status === 202 || json.pending === true) return { ok: false, pending: true, status, message, data: (json.data ?? json) as T };
  return { ok: json.success === true || (status >= 200 && status < 300), status, message, data: (json.data ?? json) as T };
}

/** "Money landed" deposit states. Exact match: "confirming" must not pass. */
export const isCredited = (status?: string) => /^(completed?|confirmed|credited|paid|succe(ss|eded)|done|finished)$/i.test((status ?? "").trim());

/**
 * A card worth adopting. A failed creation ("balance refunded") or a card the member deleted stays
 * in the issuer's list: adopting one announced money that wasn't on any card (NEWBANK, 2026-09/10).
 */
export const isUsableCard = (c: { status?: string }) => !/closed|delet|fail|declin|reject|cancel|terminat|error/i.test(c.status ?? "");

// ---------- card transactions ----------

export interface WlTransaction {
  date?: string;
  type?: string;
  merchant?: string;
  amount?: number;
  currency?: string;
  status?: string;
  reason?: string;
  reason_code?: string;
}

const OTP_RE = /(otp|one[\s-]?time|verification|verif|3ds|3-?d\s?secure|security code|passcode|auth(entication)? code)/i;

/** Identity of a movement. Status is NOT part of it: a payment settling (pending → completed) is the same payment. */
export const txKey = (t: WlTransaction) => [t.date, t.type, t.merchant, t.amount].map((v) => v ?? "").join("|");

/**
 * The one-time code in a row (Apple/Google Pay, 3-D Secure), "" for a code row whose digits are
 * hidden (expired), undefined when the row isn't a code. A merchant's "$0 card verification" without
 * digits is an ordinary check, not a code.
 */
export function otpOf(t: WlTransaction): string | undefined {
  const isCodeRow = /^otp$/i.test(t.type ?? "");
  const text = [t.type, t.merchant, t.reason, t.status].filter(Boolean).join(" ");
  if (!isCodeRow && !OTP_RE.test(text)) return undefined;
  const digits = (text.match(/(?<![\d.])\d{6}(?![\d.])/) ?? text.match(/(?<![\d.])\d{4,8}(?![\d.])/))?.[0];
  if (digits) return digits;
  return isCodeRow ? "" : undefined;
}

export type TxStatus = "completed" | "failed" | "pending" | "declined" | "reversed";
export function txStatus(s?: string): TxStatus {
  const v = (s ?? "").toLowerCase();
  if (v.includes("declin")) return "declined";
  if (v.includes("revers") || v.includes("refund")) return "reversed";
  if (v.includes("fail")) return "failed";
  if (v.includes("pend") || v.includes("auth") || v.includes("process")) return "pending";
  return "completed";
}

/** The issuer's own load/top-up rows (we announce our loads ourselves). Refunds are not loads. */
export const isLoadRow = (t: WlTransaction) => /refund|credit|topup|top-up|load|fund|deposit/i.test(t.type ?? "");

/** A $0 row that isn't a code: a merchant checking the card. Never a charge. */
export const isZeroVerification = (t: WlTransaction) => Math.abs(Number(t.amount ?? 0)) === 0 && otpOf(t) === undefined;

const FUEL_RE =
  /\b(BP|SHELL|EXXON|MOBIL|CHEVRON|TEXACO|SUNOCO|CITGO|MARATHON|SPEEDWAY|CIRCLE K|7-ELEVEN|WAWA|SHEETZ|ARCO|VALERO|PHILLIPS 66|CONOCO|CASEY'?S|KWIK|QUIKTRIP|QT|PILOT|FLYING J|LOVE'?S|HOLIDAY|KUM ?& ?GO|RACETRAC|MURPHY|COSTCO GAS|SAM'?S FUEL|ESSO|PETRO|FUEL|GAS)\b/i;
/** Pay-at-the-pump: a round hold that settles to what was pumped. */
export const isPumpHold = (t: WlTransaction) =>
  txStatus(t.status) === "pending" && FUEL_RE.test(t.merchant ?? "") && [1, 50, 75, 100, 125, 150, 175, 200].includes(Math.abs(Number(t.amount ?? 0)));

/**
 * The issuer lists one payment twice: the authorization and the capture. Pairs each settled row with
 * the authorization it settles: same merchant and currency; equal amount, or ≤ a pump hold, or up to
 * 30% more within 10 days (a tip); not earlier than the authorization (60 s slack); each authorization
 * once; exact amount wins over a tip. Declined/failed/reversed rows never pair.
 * Returns authorization → the settlement that completes it.
 */
export function settledAuths(rows: WlTransaction[]): Map<WlTransaction, WlTransaction> {
  const norm = (m?: string) => (m ?? "").trim().toLowerCase();
  const amt = (t: WlTransaction) => Math.round(Math.abs(Number(t.amount ?? 0)) * 100);
  const when = (t: WlTransaction) => Date.parse(t.date ?? "") || 0;
  const isAuth = (t: WlTransaction) => /auth/i.test(t.type ?? "");
  const isCapture = (t: WlTransaction) => /purchase|capture|clear|settle/i.test(t.type ?? "");
  const dead = (t: WlTransaction) => ["declined", "failed", "reversed"].includes(txStatus(t.status));
  const auths = rows.filter((t) => amt(t) > 0 && !isCapture(t) && !dead(t) && (isAuth(t) || txStatus(t.status) === "pending"));
  const pairs = new Map<WlTransaction, WlTransaction>();
  const settled = rows
    .filter((t) => amt(t) > 0 && !isLoadRow(t) && !isAuth(t) && !dead(t) && (txStatus(t.status) !== "pending" || isCapture(t)))
    .sort((a, b) => when(a) - when(b));
  for (const s of settled) {
    const match = auths
      .filter(
        (a) =>
          a !== s &&
          !pairs.has(a) &&
          norm(a.merchant) === norm(s.merchant) &&
          (a.currency ?? "USD") === (s.currency ?? "USD") &&
          (amt(a) === amt(s) || (isPumpHold(a) && amt(s) <= amt(a)) || (amt(s) > amt(a) && amt(s) <= Math.round(amt(a) * 1.3) && when(s) - when(a) < 10 * 86_400_000)) &&
          when(s) >= when(a) - 60_000,
      )
      .sort((a, b) => Number(amt(a) !== amt(s)) - Number(amt(b) !== amt(s)) || when(a) - when(b))[0];
    if (match) pairs.set(match, s);
  }
  return pairs;
}

// ---------- declines ----------

const CRYPTO = /moonpay|coindisco|coinbase|binance|kraken|crypto|bitcoin|btc|bitpanda|bitstamp|kucoin|bybit|okx|gemini|transak|banxa|mercuryo|simplex|paybis|changelly|ramp network|stellarterm|lobstr|uphold|robinhood crypto/i;
const GAMBLING = /casino|bet365|betting|poker|lottery|draftkings|fanduel|stake\.com/i;
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Why a payment was declined, in words a member can act on. Every hint says nothing was charged. */
export function declineReason(reason: string | undefined, merchant: string, balance?: number | null): { title: string; hint: string } {
  const r = (reason ?? "").toLowerCase();
  const m = merchant.toLowerCase();
  if (CRYPTO.test(m) || /crypto|quasi.?cash|6051/.test(r))
    return { title: "Crypto purchases aren't supported", hint: "Cards like this one can't buy crypto (on-ramps, exchanges). Nothing was charged." };
  if (GAMBLING.test(m) || /gambl|7995/.test(r)) return { title: "Gambling isn't supported", hint: "Betting and casino payments are blocked on this card. Nothing was charged." };
  if (/insufficient|balance|funds|not enough/.test(r))
    return { title: "Not enough on the card", hint: `The payment was more than what's on the card${typeof balance === "number" ? ` (${money(balance)} available)` : ""}. Nothing was charged.` };
  if (/cvv|cvc|security code/.test(r)) return { title: "Wrong CVV", hint: "The 3-digit code didn't match. Check it under Show details and try again. Nothing was charged." };
  if (/expir/.test(r)) return { title: "Wrong expiry date", hint: "The expiry date entered didn't match the card. Nothing was charged." };
  if (/3ds|3-d|authenticat|otp|one.?time/.test(r))
    return { title: "Verification not completed", hint: "The store asked for a verification code that wasn't entered in time. The code appears on this page and in Telegram. Nothing was charged." };
  if (/frozen|blocked|inactive|lost|stolen/.test(r)) return { title: "Card is frozen", hint: "Unfreeze the card, then pay again. Nothing was charged." };
  if (/address|avs|zip|postal/.test(r)) return { title: "Billing address didn't match", hint: "Use the same name and address as on your card. Nothing was charged." };
  if (/limit|velocity|exceed/.test(r)) return { title: "Over a spending limit", hint: "This payment went over a card limit. Try a smaller amount. Nothing was charged." };
  if (/mcc|merchant category|not supported|not allowed|restricted/.test(r))
    return { title: "This kind of store isn't supported", hint: "The card can't be used for this type of merchant. Nothing was charged." };
  return { title: "Declined by the card network", hint: "Nothing was charged. Try once more or pay another way. If it keeps happening at normal stores, contact support." };
}

// ---------- the member's legal name ----------

/** The name embossed on the card: a real first + last name in plain Latin capitals, 3–26 characters. Null if not valid. */
export function cardNameOf(input: string): string | null {
  const s = input.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  if (s.length < 3 || s.length > 26) return null;
  if (!/^[A-Z][A-Z' .-]*[A-Z.]$/.test(s)) return null;
  if (s.split(" ").filter((w) => /[A-Z]{2,}|[A-Z]\./.test(w)).length < 2) return null;
  return s;
}

/** E.164: "+" then 7–15 digits. */
export const isMobile = (m: string) => /^\+\d{7,15}$/.test(m);

// ---------- money: fees, the owner's ladder, limits ----------

const FEE_FIXED = Number(process.env.CARD_FEE_FIXED_USD) || 6.2;
const FEE_PCT = Number(process.env.CARD_FEE_PCT) || 0.04;
/** Issuer fee to buy a card with this load (observed: $6.20 + 4% of the load). */
export const cardFeeUsd = (load: number) => Math.round((FEE_FIXED + load * FEE_PCT) * 100) / 100;
/** Balance needed to buy a card with this load. */
export const cardCostUsd = (load: number) => Math.round((load + cardFeeUsd(load)) * 100) / 100;
/** What to credit for that: the cost rounded up to whole dollars. */
export const cardCreditUsd = (load: number) => Math.ceil(cardCostUsd(load));
/** A top-up onto an existing card costs $1 + 4% of the gross (observed: $25 → $27.08). */
export const topupCostUsd = (amount: number) => Math.round(((amount + 1) / 0.96) * 100) / 100;

/**
 * Owner's StellarPay ladder (2026-11-12): what a card is loaded with, by XLMTREASURY2 tier. No card below
 * Tier 3. The owner loads members by hand (at the card issuer); the app issues the card through the API
 * once the member's balance there covers the tier load + fee, and reads everything else back.
 */
export const CARD_LOAD_BY_TIER: Record<number, number> = { 3: 20, 4: 50, 5: 100, 6: 200, 7: 400, 8: 1000, 9: 2000, 10: 4000, 11: 6000, 12: 8000 };
export const CARD_MIN_TIER = Number(process.env.CARD_MIN_TIER) || 3;
export const cardLoadUsd = (tier: number | null | undefined) => CARD_LOAD_BY_TIER[tier ?? 0] ?? 0;

export const usd = (n: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
};
