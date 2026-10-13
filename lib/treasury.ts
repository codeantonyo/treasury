// In-app money: each member's XLM TREASURY Account (main, in XLM) and up to 3 cards.
// In-app balances only: not on-chain, not a bank account, not payment cards.
//
// Rules (owner's money brief):
// - creditMember() is the ONLY way money enters. It routes to the member's default destination,
//   falls back to the main account if that card is frozen/closed, and never drops money.
// - Every movement is ONE locked transaction (debit + credit together) whose movement row id is the
//   idempotency key / claim id: a retry, double tap or second device can never apply it twice.
// - The server computes every amount. Balances never go below zero.
// - Accruals keep a running total that only moves forward (never recomputed from today's holdings).
import { createHash, randomUUID } from "node:crypto";
import { WALLET_TOKENS } from "./tokens.ts";
import { Conflict, type Accrual, type CardId, type makeDb, type Movement, type Pocket, type Treasury, type TreasuryCard, type Tx } from "./db.ts";
import { shortNum } from "./currencies.ts";
import { convert, fromUnits, type Currency, type Rates } from "./fx.ts";

type Db = ReturnType<typeof makeDb>;

export const MAX_CARDS = 3;
export const FREEZE_MIN_MS = 30 * 86_400_000; // can't unfreeze for 30 days
/** Rewards that may only land on a card (owner: everything from the tier systems and airdrops). */
export const CARD_ONLY_SOURCES = new Set(["tier", "airdrop"]);
const cardOnly = (source: string) => CARD_ONLY_SOURCES.has(source) || source.startsWith("sim:");
/** ponytail: placeholder rate (0.1% of XLMTREASURY2 holding per day) until the owner sets the real one. */
export const TIER_RATE_PER_DAY = 0.001;
const DAY = 86_400_000;

/** A refusal to show the member (not a bug). */
export class MoneyError extends Error {}

export const SOURCE_LABEL: Record<string, string> = {
  tier: "Tier reward",
  airdrop: "Airdrop",
  streak: "Streak reward",
  admin: "Adjustment by XLM TREASURY",
  transfer: "Transfer",
  p2p: "Transfer",
  "card-close": "Card closed",
};

/** Human label for a movement source ("sim:PROTOCOL26" → "Withdraw from Protocol 26"). */
export const sourceLabel = (source: string) =>
  source.startsWith("sim:") ? `Withdraw from ${WALLET_TOKENS.find((t) => t.code === source.slice(4))?.name ?? source.slice(4)}` : (SOURCE_LABEL[source] ?? source);

export const newTreasury = (id: string): Treasury => ({
  id,
  main: { currency: "XLM", balance: "0" },
  cards: {},
  defaultDestination: "main",
  accruals: {},
  pending: [],
});

/** Make sure the member has a treasury record (every member gets one). */
export async function ensureTreasury(db: Db, userId: string): Promise<Treasury> {
  const found = await db.get("treasury", userId);
  if (found) return found;
  try {
    return await db.tx((t) => t.insert("treasury", newTreasury(userId)));
  } catch (e) {
    if (e instanceof Conflict) return (await db.get("treasury", userId))!; // created concurrently
    throw e;
  }
}

// ---------- pockets ----------

const cardOf = (tr: Treasury, p: Pocket | string) => (p.startsWith("card:") ? tr.cards[p.slice(5)] : undefined);

export function pocket(tr: Treasury, p: Pocket | string): { currency: Currency; balance: bigint; card?: TreasuryCard } {
  if (p === "main") return { currency: "XLM", balance: BigInt(tr.main.balance) };
  const card = cardOf(tr, p);
  if (!card) throw new MoneyError("That card doesn't exist.");
  return { currency: card.currency, balance: BigInt(card.balance), card };
}

export const pocketName = (tr: Treasury, p: string) => (p === "main" ? "Main account" : `${cardOf(tr, p)?.name ?? "Closed"} card`);

function setBalance(tr: Treasury, p: Pocket | string, units: bigint): Treasury {
  if (units < 0n) throw new MoneyError("Not enough balance."); // never below zero, checked inside the locked write
  if (p === "main") return { ...tr, main: { ...tr.main, balance: units.toString() } };
  const card = cardOf(tr, p)!;
  return { ...tr, cards: { ...tr.cards, [card.id]: { ...card, balance: units.toString() } } };
}

const usable = (tr: Treasury, p: Pocket | string) => p === "main" || cardOf(tr, p)?.status === "active";
const activeCards = (tr: Treasury) => Object.values(tr.cards).filter((c) => c.status === "active").sort((a, b) => a.createdAt - b.createdAt);

const fmt = (units: bigint, cur: Currency) => `${shortNum(fromUnits(units), cur === "JPY" ? 0 : 2)} ${cur}`;

// ---------- the one transaction shape ----------

/** Lock the treasuries (in a fixed order), return the earlier result if this id already ran, else run fn. */
async function once(db: Db, id: string, userIds: string[], fn: (t: Tx, trs: Record<string, Treasury>) => Promise<Movement | null>): Promise<Movement | null> {
  return db.tx(async (t) => {
    const trs: Record<string, Treasury> = {};
    for (const uid of [...new Set(userIds)].sort()) {
      const tr = await t.get("treasury", uid);
      if (!tr) throw new MoneyError("Account not found.");
      trs[uid] = tr;
    }
    const prior = await t.get("movements", id); // checked under the lock: concurrent duplicates wait, then see it
    if (prior) return prior;
    return fn(t, trs);
  });
}

const reqId = (accountId: string, key: string) => {
  if (!/^[\w-]{8,100}$/.test(key)) throw new MoneyError("Invalid request key.");
  return `req:${accountId}:${key}`;
};

const notify = (t: Tx, userId: string, text: string) => t.insert("notifications", { id: randomUUID(), userId, at: Date.now(), text, read: false });

// ---------- credits (the only way money enters) ----------

export type Credit = {
  accountId: string;
  amount: bigint;
  currency: Currency;
  source: string; // "tier" | "airdrop" | "streak" | "admin" | …
  claimId: string; // unique per reward: the same claim never pays twice
  destination?: Pocket; // this one time; else the member's default
  memo?: string;
};

type Landing = { movement: Movement | null; to: string | null; note: string | null; held: boolean };

/** Apply a credit inside an open transaction. `noCard`: what to do with a card-only reward when the member has no active card. */
async function applyCredit(t: Tx, tr: Treasury, c: Credit, rates: Rates, noCard: "hold" | "refuse"): Promise<{ tr: Treasury } & Landing> {
  if (c.amount <= 0n) throw new MoneyError("Amount must be positive.");
  const want = c.destination ?? tr.defaultDestination;
  let to: string | null = want, note: string | null = null;

  if (cardOnly(c.source)) {
    if (!(want !== "main" && usable(tr, want))) {
      const first = activeCards(tr)[0];
      to = first ? `card:${first.id}` : null;
      if (first && want !== "main") note = `Your ${cardOf(tr, want)?.name ?? ""} card is ${cardOf(tr, want)?.status ?? "closed"}, so this went to your ${first.name} card`;
    }
    if (!to) {
      if (noCard === "refuse") throw new MoneyError("This reward goes to a card. Create a card first, then collect it.");
      const pending = [...tr.pending, { claimId: c.claimId, amount: c.amount.toString(), currency: c.currency, source: c.source, memo: c.memo ?? "", at: Date.now() }];
      await notify(t, c.accountId, `${sourceLabel(c.source)} of ${fmt(c.amount, c.currency)} is waiting: create a card to receive it`);
      return { tr: { ...tr, pending }, movement: null, to: null, note: null, held: true };
    }
  } else if (!usable(tr, want)) {
    note = `Your ${cardOf(tr, want)?.name ?? ""} card is ${cardOf(tr, want)?.status ?? "closed"}, so this went to your main account`;
    to = "main";
  }

  const dest = pocket(tr, to!);
  const { units, rate } = convert(c.amount, c.currency, dest.currency, rates);
  const next = setBalance(tr, to!, dest.balance + units);
  const movement = await t.insert("movements", {
    id: `claim:${c.claimId}`, at: Date.now(), accountId: c.accountId, counterpartyId: null,
    from: `reward:${c.source}`, to: to!, sent: null, amount: units.toString(), currency: dest.currency,
    xlmValue: convert(c.amount, c.currency, "XLM", rates).units.toString(), fxRate: rate, source: c.source, memo: c.memo ?? "",
  });
  await notify(t, c.accountId, `+${fmt(units, dest.currency)} · ${sourceLabel(c.source)} → ${pocketName(next, to!)}${note ? `. ${note}` : ""}`);
  return { tr: next, movement, to, note, held: false };
}

/** Credit a member. Every reward, airdrop, payout and admin credit goes through here. */
export async function creditMember(db: Db, rates: Rates, c: Credit): Promise<Landing> {
  await ensureTreasury(db, c.accountId);
  const id = `claim:${c.claimId}`;
  let landing: Landing = { movement: null, to: null, note: null, held: false };
  const m = await once(db, id, [c.accountId], async (t, trs) => {
    const tr = trs[c.accountId];
    if (tr.pending.some((p) => p.claimId === c.claimId)) {
      landing = { movement: null, to: null, note: null, held: true };
      return null;
    }
    const r = await applyCredit(t, tr, c, rates, "hold");
    await t.put("treasury", r.tr);
    landing = r;
    return r.movement;
  });
  return m && !landing.movement ? { movement: m, to: m.to, note: null, held: false } : landing;
}

// ---------- moving money ----------

/** Own account ↔ cards and card ↔ card. `amount` is in the source pocket's currency; the server converts. */
export async function transfer(db: Db, rates: Rates, o: { accountId: string; from: Pocket; to: Pocket; amount: bigint; key: string }): Promise<Movement> {
  if (o.from === o.to) throw new MoneyError("Pick two different places.");
  if (o.amount <= 0n) throw new MoneyError("Enter an amount above zero.");
  return (await once(db, reqId(o.accountId, o.key), [o.accountId], async (t, trs) => {
    let tr = trs[o.accountId];
    const src = pocket(tr, o.from), dst = pocket(tr, o.to);
    if (!usable(tr, o.from) || !usable(tr, o.to)) throw new MoneyError("Frozen or closed cards can't send or receive.");
    if (src.balance < o.amount) throw new MoneyError(`Not enough balance. Available: ${fmt(src.balance, src.currency)}.`);
    const { units, rate } = convert(o.amount, src.currency, dst.currency, rates);
    tr = setBalance(tr, o.from, src.balance - o.amount);
    tr = setBalance(tr, o.to, pocket(tr, o.to).balance + units);
    await t.put("treasury", tr);
    return t.insert("movements", {
      id: reqId(o.accountId, o.key), at: Date.now(), accountId: o.accountId, counterpartyId: null, from: o.from, to: o.to,
      sent: { amount: o.amount.toString(), currency: src.currency }, amount: units.toString(), currency: dst.currency,
      xlmValue: convert(o.amount, src.currency, "XLM", rates).units.toString(), fxRate: rate, source: "transfer", memo: "",
    });
  }))!;
}

/** Send to another member's main account. No cap beyond the sender's balance (owner's decision). */
export async function send(db: Db, rates: Rates, o: { accountId: string; toUserId: string; from: Pocket; amount: bigint; key: string; senderTag: string }): Promise<Movement> {
  if (o.toUserId === o.accountId) throw new MoneyError("You can't send to yourself. Use Move instead.");
  if (o.amount <= 0n) throw new MoneyError("Enter an amount above zero.");
  await ensureTreasury(db, o.toUserId);
  return (await once(db, reqId(o.accountId, o.key), [o.accountId, o.toUserId], async (t, trs) => {
    const mine = trs[o.accountId], theirs = trs[o.toUserId];
    const src = pocket(mine, o.from);
    if (!usable(mine, o.from)) throw new MoneyError("Frozen or closed cards can't send.");
    if (src.balance < o.amount) throw new MoneyError(`Not enough balance. Available: ${fmt(src.balance, src.currency)}.`);
    const { units, rate } = convert(o.amount, src.currency, "XLM", rates);
    await t.put("treasury", setBalance(mine, o.from, src.balance - o.amount));
    await t.put("treasury", setBalance(theirs, "main", BigInt(theirs.main.balance) + units));
    await notify(t, o.toUserId, `+${fmt(units, "XLM")} · From @${o.senderTag} → Main account`);
    return t.insert("movements", {
      id: reqId(o.accountId, o.key), at: Date.now(), accountId: o.accountId, counterpartyId: o.toUserId, from: o.from, to: `p2p:${o.toUserId}`,
      sent: { amount: o.amount.toString(), currency: src.currency }, amount: units.toString(), currency: "XLM",
      xlmValue: units.toString(), fxRate: rate, source: "p2p", memo: "",
    });
  }))!;
}

// ---------- cards ----------

export async function createCard(
  db: Db,
  rates: Rates | null,
  o: { accountId: string; name: string; design: CardId; currency: Currency; key: string },
): Promise<TreasuryCard> {
  const name = o.name.trim();
  if (name.length < 1 || name.length > 24) throw new MoneyError("Card name: 1–24 characters.");
  const id = createHash("sha256").update(`${o.accountId}:${o.key}`).digest("hex").slice(0, 12); // same key, same card
  await ensureTreasury(db, o.accountId);
  return db.tx(async (t) => {
    let tr = (await t.get("treasury", o.accountId))!;
    if (tr.cards[id]) return tr.cards[id];
    if (Object.values(tr.cards).filter((c) => c.status !== "closed").length >= MAX_CARDS) throw new MoneyError(`You can hold up to ${MAX_CARDS} cards.`);
    if (tr.pending.length && !rates) throw new MoneyError("Exchange rates are unavailable right now. Please try again in a moment.");
    const card: TreasuryCard = { id, name, design: o.design, currency: o.currency, balance: "0", status: "active", frozenUntil: null, createdAt: Date.now(), closedAt: null };
    tr = { ...tr, cards: { ...tr.cards, [id]: card } };
    // Card-only rewards that were waiting for a card land here now.
    const waiting = tr.pending;
    tr = { ...tr, pending: [] };
    for (const p of waiting) {
      const r = await applyCredit(t, tr, { accountId: o.accountId, amount: BigInt(p.amount), currency: p.currency, source: p.source, claimId: p.claimId, destination: `card:${id}`, memo: p.memo }, rates!, "refuse");
      tr = r.tr;
    }
    await t.put("treasury", tr);
    return tr.cards[id];
  });
}

async function updateCard(db: Db, accountId: string, cardId: string, fn: (c: TreasuryCard, tr: Treasury) => TreasuryCard, extra?: (tr: Treasury) => Treasury) {
  return db.tx(async (t) => {
    const tr = await t.get("treasury", accountId);
    const card = tr?.cards[cardId];
    if (!tr || !card || card.status === "closed") throw new MoneyError("That card doesn't exist.");
    const next = { ...tr, cards: { ...tr.cards, [cardId]: fn(card, tr) } };
    await t.put("treasury", extra ? extra(next) : next);
    return next.cards[cardId];
  });
}

export const renameCard = (db: Db, accountId: string, cardId: string, name: string, design: CardId) => {
  if (name.trim().length < 1 || name.trim().length > 24) throw new MoneyError("Card name: 1–24 characters.");
  return updateCard(db, accountId, cardId, (c) => ({ ...c, name: name.trim(), design }));
};

export const freezeCard = (db: Db, accountId: string, cardId: string, now = Date.now()) =>
  updateCard(db, accountId, cardId, (c) => (c.status === "frozen" ? c : { ...c, status: "frozen", frozenUntil: now + FREEZE_MIN_MS }));

export const unfreezeCard = (db: Db, accountId: string, cardId: string, now = Date.now()) =>
  updateCard(db, accountId, cardId, (c) => {
    if (c.status !== "frozen") return c;
    if (c.frozenUntil && now < c.frozenUntil) throw new MoneyError(`This card can be unfrozen from ${new Date(c.frozenUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`);
    return { ...c, status: "active", frozenUntil: null };
  });

/** Close a card: its full balance first moves to the main account (converted), as one movement. Never deleted. */
export async function closeCard(db: Db, rates: Rates, o: { accountId: string; cardId: string; key: string }): Promise<Movement | null> {
  return once(db, reqId(o.accountId, o.key), [o.accountId], async (t, trs) => {
    let tr = trs[o.accountId];
    const card = tr.cards[o.cardId];
    if (!card || card.status === "closed") throw new MoneyError("That card is already closed.");
    if (card.status === "frozen") throw new MoneyError("Frozen cards can't send money. Unfreeze it first, then close it.");
    const bal = BigInt(card.balance);
    const { units, rate } = convert(bal, card.currency, "XLM", rates);
    tr = setBalance(tr, `card:${card.id}`, 0n);
    tr = setBalance(tr, "main", BigInt(tr.main.balance) + units);
    tr = {
      ...tr,
      cards: { ...tr.cards, [card.id]: { ...tr.cards[card.id], status: "closed", closedAt: Date.now() } },
      defaultDestination: tr.defaultDestination === `card:${card.id}` ? "main" : tr.defaultDestination,
    };
    await t.put("treasury", tr);
    return t.insert("movements", {
      id: reqId(o.accountId, o.key), at: Date.now(), accountId: o.accountId, counterpartyId: null, from: `card:${card.id}`, to: "main",
      sent: { amount: bal.toString(), currency: card.currency }, amount: units.toString(), currency: "XLM",
      xlmValue: units.toString(), fxRate: rate, source: "card-close", memo: card.name,
    });
  });
}

export async function setDefaultDestination(db: Db, accountId: string, dest: Pocket) {
  await ensureTreasury(db, accountId);
  await db.tx(async (t) => {
    const tr = (await t.get("treasury", accountId))!;
    if (!usable(tr, dest)) throw new MoneyError("Pick your main account or an active card.");
    await t.put("treasury", { ...tr, defaultDestination: dest });
  });
}

// ---------- rewards that build up over time ----------

/**
 * Move an accrual forward to `now` at `ratePerDay` × current holding. Starts at `startAt` (the day the
 * member linked a wallet). Only ever adds; reading twice at the same time adds nothing.
 */
export function advance(a: Accrual | undefined, holding: number, startAt: number | null, now: number, ratePerDay = TIER_RATE_PER_DAY): Accrual {
  return advanceBy(a, Math.max(0, holding) * ratePerDay, startAt, now);
}

/** Move an accrual forward at a flat amount per day (simulated tier rewards). Only ever adds. */
export function advanceBy(a: Accrual | undefined, perDay: number, startAt: number | null, now: number): Accrual {
  const cur = a ?? { accrued: "0", accruedAt: null, collected: "0" };
  const from = cur.accruedAt ?? startAt;
  if (from === null || now <= from) return { ...cur, accruedAt: from };
  const add = BigInt(Math.floor(Math.max(0, perDay) * ((now - from) / DAY) * 1e7));
  return { accrued: (BigInt(cur.accrued) + add).toString(), accruedAt: now, collected: cur.collected };
}

/** Advance several flat-rate accruals in one locked write (on every read). Returns them as saved. */
export async function touchFlatAccruals(db: Db, accountId: string, entries: { key: string; perDay: number }[], startAt: number | null, now = Date.now()) {
  await ensureTreasury(db, accountId);
  return db.tx(async (t) => {
    const tr = (await t.get("treasury", accountId))!;
    const accruals = { ...tr.accruals };
    for (const e of entries) accruals[e.key] = advanceBy(tr.accruals[e.key], e.perDay, startAt, now);
    if (JSON.stringify(accruals) !== JSON.stringify(tr.accruals)) await t.put("treasury", { ...tr, accruals });
    return accruals;
  });
}

export const readyToCollect = (a: Accrual | undefined) => (a ? BigInt(a.accrued) - BigInt(a.collected) : 0n);

/** Save the accrual moved forward (on every read). `holding` must be a fresh Stellar read. */
export async function touchAccrual(db: Db, accountId: string, source: string, holding: number, startAt: number | null, now = Date.now()): Promise<Accrual> {
  await ensureTreasury(db, accountId);
  return db.tx(async (t) => {
    const tr = (await t.get("treasury", accountId))!;
    const next = advance(tr.accruals[source], holding, startAt, now);
    if (JSON.stringify(next) !== JSON.stringify(tr.accruals[source])) await t.put("treasury", { ...tr, accruals: { ...tr.accruals, [source]: next } });
    return next;
  });
}

/**
 * Collect what's ready from an accrual (in XLMTREASURY2 units), paid in XLM at `tokenPriceXlm`.
 * The server computes the amount; `amount`, if given, may not exceed what's ready.
 */
export async function collect(
  db: Db,
  rates: Rates,
  o: {
    accountId: string;
    source: string; // movement source, e.g. "tier" or "sim:PROTOCOL26"
    accrualKey?: string; // defaults to `source`
    key: string;
    tokenPriceXlm: number; // XLM per unit of what accrued
    holding?: number; // with TIER_RATE_PER_DAY …
    perDay?: number; // … or a flat amount per day
    unit?: string; // what accrued, for the memo
    startAt: number | null;
    destination?: Pocket;
    amount?: bigint;
    now?: number;
  },
): Promise<Landing> {
  await ensureTreasury(db, o.accountId);
  let landing: Landing = { movement: null, to: null, note: null, held: false };
  const accKey = o.accrualKey ?? o.source;
  const claimId = `collect:${accKey}:${o.accountId}:${o.key}`;
  const m = await once(db, `claim:${claimId}`, [o.accountId], async (t, trs) => {
    let tr = trs[o.accountId];
    const now = o.now ?? Date.now();
    const acc = o.perDay !== undefined ? advanceBy(tr.accruals[accKey], o.perDay, o.startAt, now) : advance(tr.accruals[accKey], o.holding ?? 0, o.startAt, now);
    const ready = readyToCollect(acc);
    const take = o.amount ?? ready;
    if (take <= 0n) throw new MoneyError("Nothing to collect yet.");
    if (take > ready) throw new MoneyError(`Only ${shortNum(fromUnits(ready), 4)} is ready to collect.`);
    tr = { ...tr, accruals: { ...tr.accruals, [accKey]: { ...acc, collected: (BigInt(acc.collected) + take).toString() } } };
    const xlm = (take * BigInt(Math.round(o.tokenPriceXlm * 1e12)) + 500_000_000_000n) / 1_000_000_000_000n;
    const r = await applyCredit(t, tr, { accountId: o.accountId, amount: xlm, currency: "XLM", source: o.source, claimId, destination: o.destination, memo: `${shortNum(fromUnits(take), 4)} ${o.unit ?? "XLMTREASURY2"} at ${shortNum(o.tokenPriceXlm, 4)} XLM` }, rates, "refuse");
    await t.put("treasury", r.tr);
    landing = r;
    return r.movement;
  });
  return landing.movement ? landing : { movement: m, to: m?.to ?? null, note: null, held: false };
}

// ---------- reading ----------

/** Movements for a member, newest first: their own plus transfers sent to them. */
export async function feed(db: Db, accountId: string, o: { pocket?: string; limit?: number; before?: number } = {}) {
  const [mine, toMe] = await Promise.all([db.find("movements", "accountId", accountId), db.find("movements", "counterpartyId", accountId)]);
  // ponytail: loads all of a member's rows then pages in memory; add an indexed query when feeds get long.
  let rows = [...mine, ...toMe.filter((m) => m.accountId !== accountId)].sort((a, b) => b.at - a.at);
  if (o.pocket) rows = rows.filter((m) => m.from === o.pocket || m.to === o.pocket || (o.pocket === "main" && m.counterpartyId === accountId));
  if (o.before) rows = rows.filter((m) => m.at < o.before!);
  return rows.slice(0, o.limit ?? 30);
}
