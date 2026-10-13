import "server-only";
import { cardDetails } from "./card-number";
import { CARDS } from "./cards";
import { formatMoney } from "./currencies";
import { db, type Movement, type Treasury, type User } from "./db";
import { convert, fromUnits, xlmRates, type Currency, type Rates } from "./fx";
import { ensureTreasury, feed, pocketName, sourceLabel } from "./treasury";

/** "€1,234.56", "1,234.56 XLM", and from a million up "€2.137B". `exact` never trims. */
export const money = (units: bigint | string, cur: Currency, exact = false) => formatMoney(fromUnits(units), cur, exact);

export type CardView = {
  id: string;
  name: string;
  design: string;
  currency: Currency;
  balance: string;
  display: string;
  exact: string; // the untrimmed balance (shown on hover)
  usd: number | null;
  status: string;
  frozenUntil: number | null;
  details: { number: string; last4: string; expiry: string; cvv: string }; // in-app card details, never a payment card
};

/** The member's in-app balances (main account + open cards) with ≈ USD where rates are available. */
export async function moneyView(user: User) {
  const tr = await ensureTreasury(db, user.id);
  const rates: Rates | null = await xlmRates().catch(() => null);
  const usd = (units: string, cur: Currency) => (rates ? fromUnits(convert(BigInt(units), cur, "USD", rates).units) : null);
  const cards: CardView[] = Object.values(tr.cards)
    .filter((c) => c.status !== "closed")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((c) => ({ id: c.id, name: c.name, design: c.design, currency: c.currency, balance: c.balance, display: money(c.balance, c.currency), exact: money(c.balance, c.currency, true), usd: usd(c.balance, c.currency), status: c.status, frozenUntil: c.frozenUntil, details: cardDetails(c.id, c.createdAt) }));
  return {
    tr,
    rates,
    main: { display: money(tr.main.balance, "XLM"), units: tr.main.balance, usd: usd(tr.main.balance, "XLM") },
    cards,
    cardsUsd: rates ? cards.reduce((s, c) => s + (c.usd ?? 0), 0) : null,
  };
}

export type ActivityRow = {
  id: string;
  at: number;
  kind: "reward" | "move" | "in" | "out" | "close";
  title: string;
  from: string; // pocket or "p2p"/"reward"
  to: string;
  sent: string | null; // what left `from`, formatted
  received: string; // what arrived at `to`, formatted
  // legacy view fields (account page list)
  amount: string;
  sign: "+" | "−" | "";
  sub: string | null;
  pockets: string[];
};

/** One plain-words row per movement, from this member's point of view. */
export async function activity(user: User, tr: Treasury, limit = 40): Promise<ActivityRow[]> {
  const rows = await feed(db, user.id, { limit });
  const others = new Map<string, string>();
  for (const m of rows) for (const id of [m.accountId, m.counterpartyId]) if (id && id !== user.id && !others.has(id)) others.set(id, (await db.get("users", id))?.tag ?? "member");
  return rows.map((m) => row(m, user.id, tr, others));
}

function row(m: Movement, me: string, tr: Treasury, tags: Map<string, string>): ActivityRow {
  const got = money(m.amount, m.currency);
  const sent = m.sent ? money(m.sent.amount, m.sent.currency) : null;
  const converted = m.sent && m.sent.currency !== m.currency ? `→ ${got}` : null;
  const base = { id: m.id, at: m.at, received: got, sent };
  if (m.from.startsWith("reward:"))
    return { ...base, kind: "reward", title: `${sourceLabel(m.source)} → ${pocketName(tr, m.to)}`, from: "reward", to: m.to, amount: got, sign: "+", sub: m.memo || null, pockets: [m.to] };
  if (m.source === "p2p") {
    if (m.accountId === me)
      return { ...base, kind: "out", title: `To @${tags.get(m.counterpartyId!) ?? "member"}`, from: m.from, to: "p2p", amount: sent ?? got, sign: "−", sub: null, pockets: [m.from] };
    return { ...base, kind: "in", title: `From @${tags.get(m.accountId) ?? "member"} → Main account`, from: "p2p", to: "main", amount: got, sign: "+", sub: null, pockets: ["main"] };
  }
  if (m.source === "card-close")
    return { ...base, kind: "close", title: `${m.memo} card closed → Main account`, from: m.from, to: "main", amount: sent ?? got, sign: "", sub: converted, pockets: [m.from, "main"] };
  return { ...base, kind: "move", title: `${pocketName(tr, m.from)} → ${pocketName(tr, m.to)}`, from: m.from, to: m.to, amount: sent ?? got, sign: "", sub: converted, pockets: [m.from, m.to] };
}

/** Main account + open cards, for the pickers (frozen cards shown but not selectable). */
export function pocketOptions(tr: Treasury) {
  return [
    { value: "main", label: "Main account", currency: "XLM", units: tr.main.balance, active: true },
    ...Object.values(tr.cards)
      .filter((c) => c.status !== "closed")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => ({ value: `card:${c.id}`, label: `${c.name} card`, currency: c.currency, units: c.balance, active: c.status === "active" })),
  ];
}

/** Card finishes; more unlock with tier (Silver for everyone). */
export function designOptions(bestTier: number) {
  return CARDS.map((c) => ({ id: c.id, name: c.name, thumb: c.thumb, minTier: c.minTier, unlocked: c.minTier <= Math.max(1, bestTier) }));
}
