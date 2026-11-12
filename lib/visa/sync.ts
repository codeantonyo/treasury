import "server-only";
import { db, type CardCustomer, type CardNotice } from "../db";
import { notifyAdmins, notifyMember } from "../notify";
import { StellarBusy, totalHolding } from "../stellar";
import { tierFor } from "../tiers";
import { cardDetails, cardTransactions, issueCard, listCards, memberBalance, record, update, wlMode, type Member, type WlCard } from "./issuer";
import { CARD_MIN_TIER, cardCostUsd, cardCreditUsd, cardLoadUsd, declineReason, isLoadRow, isPumpHold, isUsableCard, isZeroVerification, otpOf, settledAuths, txKey, txStatus, usd, type WlTransaction } from "./pure";

export const CARD = "StellarPay Visa";
const LOW_USD = 10;
const NOTICE_CAP = 50;

/** The member as the card system needs them, with their verified wallets. */
export async function memberOf(userId: string): Promise<(Member & { addresses: string[]; role: string }) | null> {
  const u = await db.get("users", userId);
  if (!u) return null;
  const addresses = (await db.find("wallets", "userId", userId)).filter((w) => w.status === "verified").map((w) => w.address);
  return { id: u.id, tag: u.tag, email: u.email, name: u.name, addresses, role: u.role };
}

// ---------- tier, eligibility, load ----------

const holdingCache = new Map<string, { tier: number; at: number }>();

/** XLMTREASURY2 tier from the member's verified wallets, cached an hour. On a Stellar error the last verdict stands. */
export async function tierOf(member: Member & { addresses: string[] }, maxAgeMs = 3_600_000): Promise<number | null> {
  const rec = await record(member.id);
  const hit = holdingCache.get(member.id);
  if (rec?.tierAt && Date.now() - rec.tierAt < maxAgeMs) return rec.tier ?? null;
  if (!rec && hit && Date.now() - hit.at < maxAgeMs) return hit.tier;
  let tier: number;
  try {
    tier = member.addresses.length ? tierFor(await totalHolding(member.addresses)) : 0;
  } catch (e) {
    if (!(e instanceof StellarBusy)) throw e;
    return rec?.tier ?? hit?.tier ?? null; // never widen access on an error
  }
  holdingCache.set(member.id, { tier, at: Date.now() });
  if (rec) await update(member.id, (m) => void ((m.tier = tier), (m.tierAt = Date.now())));
  return tier;
}

const list = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
const named = (names: string[], m: { tag: string; email: string }) => names.some((x) => x === m.tag.toLowerCase() || x === m.email.toLowerCase());

/**
 * Who can see the StellarPay Visa at all (page, Home tile, API, console). Owner, 2026-11-12: only
 * @kimjoyce while testing. CARD_VISIBLE_TO = comma list of usernames/emails; "*" opens it to every member.
 */
const visibleTo = () => list(process.env.CARD_VISIBLE_TO ?? "kimjoyce");
export const canSeeCard = (m: { tag: string; email: string }) => visibleTo().includes("*") || named(visibleTo(), m);

/** Pilot members can get a card whatever their tier: CARD_PILOT_USERNAMES plus the people it's limited to. */
const onPilotList = (m: Member) => named([...list(process.env.CARD_PILOT_USERNAMES ?? ""), ...visibleTo().filter((x) => x !== "*")], m);

/** Owner's rule: XLMTREASURY2 Tier 3+ (CARD_MIN_TIER), or the pilot list, or already has a card / reservation. */
export async function eligibility(member: Member & { addresses: string[] }): Promise<{ eligible: boolean; tier: number | null }> {
  const rec = await record(member.id);
  const tier = await tierOf(member);
  if (rec?.cardId || rec?.requestedAt || onPilotList(member)) return { eligible: true, tier };
  return { eligible: (tier ?? 0) >= CARD_MIN_TIER, tier };
}

/** The load for the member's tier (pilot members get at least Tier 3's). */
export const loadFor = (member: Member, tier: number | null) =>
  Number(process.env.CARD_PILOT_ISSUE_USD) || Math.max(cardLoadUsd(tier), onPilotList(member) ? cardLoadUsd(CARD_MIN_TIER) : 0);

// ---------- sync: movements, the owner's loads, codes, running low ----------

function describe(t: WlTransaction, last4?: string, balance?: number): { kind: CardNotice["kind"]; title: string; body: string; tg: string } {
  const amount = usd(Math.abs(Number(t.amount ?? 0)), t.currency ?? "USD");
  const merchant = (t.merchant ?? "").trim() || t.type || "Card payment";
  const tail = [last4 ? `Visa ··${last4}` : "", typeof balance === "number" ? `${usd(balance)} left` : ""].filter(Boolean).join(" · ");
  const st = txStatus(t.status);
  if (isLoadRow(t) && !/refund/i.test(t.type ?? ""))
    return { kind: "load", title: `+${amount} loaded`, body: `By XLM TREASURY · ${tail}`, tg: `💧 <b>+${amount}</b> loaded onto your ${CARD} by XLM TREASURY.\n${tail}` };
  if (st === "reversed" || /refund/i.test(t.type ?? "")) return { kind: "refund", title: `+${amount} refunded`, body: `${merchant} · ${tail}`, tg: `↩️ <b>+${amount}</b> refunded by ${merchant}\n${tail}` };
  if (st === "declined" || st === "failed") {
    const why = declineReason(t.reason, merchant, balance);
    return { kind: "declined", title: `Declined ${amount}`, body: `${merchant}: ${why.title} · ${tail}`, tg: `⛔ <b>Declined ${amount}</b> at ${merchant}\n<b>${why.title}.</b> ${why.hint}\n${tail}` };
  }
  if (isPumpHold(t))
    return { kind: "payment", title: `Fuel hold ${amount}`, body: `${merchant} · temporary pump hold, you're only charged what you pumped`, tg: `⛽ <b>${amount}</b> temporary hold at ${merchant}\nIt settles to what you actually pumped within 1–3 days.` };
  return { kind: "payment", title: `Paid ${amount}`, body: `${merchant} · ${tail}`, tg: `💳 <b>Paid ${amount}</b> at ${merchant}\n${tail}` };
}

export interface SyncResult {
  card?: WlCard;
  rows: WlTransaction[];
  failed?: true; // the issuer didn't answer: rows are unknown, not empty
  otp?: string;
}

/**
 * Read the card, tell the member what's new (in-app + Telegram): payments, refunds, declines, the owner's
 * loads, one-time codes (Apple/Google Pay, 3-D Secure). Runs from the cron AND the page's poll, so it is
 * idempotent: messages go out only from the pass that wins the compare-and-set on the markers.
 */
export async function syncCard(member: Member): Promise<SyncResult> {
  const rec = await record(member.id);
  if (!rec?.cardId) return { rows: [] };
  const [c, t] = await Promise.all([cardDetails(member, rec.cardId), cardTransactions(member, rec.cardId)]);
  const card = c.ok ? c.data : undefined;
  if (card && typeof card.balance_usd === "number" && card.balance_usd !== rec.lastBalance) await update(member.id, (m) => void (m.lastBalance = card.balance_usd as number));
  if (!t.ok) return { card, rows: [], failed: true };
  const rows = [...t.data].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const balance = card && typeof card.balance_usd === "number" ? card.balance_usd : undefined;
  const tg: string[] = [];

  // one-time codes: the freshest unseen one from the last 15 min
  let otp: string | undefined;
  const fresh = Date.now() - 15 * 60_000;
  const codeRow = rows.find((r) => {
    const code = otpOf(r);
    return code && code !== rec.seenOtp && (!r.date || Date.parse(r.date) > fresh || Number.isNaN(Date.parse(r.date)));
  });
  if (codeRow) {
    otp = otpOf(codeRow);
    tg.push(`🔐 Your card verification code: <code>${otp}</code>\n\nEnter it in your phone's wallet to finish adding your ${CARD}. It expires in a few minutes.`);
  }
  const last4 = rec.last4 ?? card?.last4 ?? undefined;

  // new movements since the marker; the first pass for a card announces nothing (never replay history)
  const keys = rows.map(txKey);
  const seenAt = rec.seenTx ? keys.indexOf(rec.seenTx) : -1;
  const dayAgo = Date.now() - 86_400_000;
  const told = new Set([...(rec.seenKeys ?? []), ...(rec.notices ?? []).map((n) => n.id.replace(/^tx-/, ""))]);
  const freshRows = (rec.seenTx === undefined ? [] : seenAt === -1 ? rows.filter((r) => !r.date || (Date.parse(r.date) || 0) > dayAgo) : rows.slice(0, seenAt)).filter((r) => !told.has(txKey(r)));
  const echoes = new Set(settledAuths(rows).values());
  const news = freshRows.filter((r) => otpOf(r) === undefined && !isZeroVerification(r) && !echoes.has(r)).reverse();

  const notices: CardNotice[] = [];
  let firstPurchaseAt = rec.firstPurchaseAt;
  let lastLoadAt = rec.lastLoadAt;
  for (const r of news) {
    const d = describe(r, last4, balance);
    notices.push({ id: `tx-${txKey(r)}`, at: r.date ? Date.parse(r.date) || Date.now() : Date.now(), kind: d.kind, title: d.title, body: d.body });
    tg.push(d.tg);
    if (d.kind === "load") lastLoadAt = Date.now();
    if (!firstPurchaseAt && d.kind === "payment" && txStatus(r.status) === "completed") firstPurchaseAt = Date.now();
  }

  // running low: once per load, never on the first pass
  let lowAt = rec.lowBalanceAlertAt;
  if (typeof balance === "number" && balance >= 0 && balance < LOW_USD && (!lowAt || lowAt < (lastLoadAt ?? rec.createdAt)) && rec.seenTx !== undefined) {
    lowAt = Date.now();
    notices.push({ id: `low-${lowAt}`, at: lowAt, kind: "low", title: "Card running low", body: `${usd(balance)} left on your ${CARD}.` });
    tg.push(`🪫 Your ${CARD} is running low: <b>${usd(balance)}</b> left.`);
  }

  const newest = keys[0];
  let won = true;
  if (notices.length || otp || newest !== rec.seenTx || firstPurchaseAt !== rec.firstPurchaseAt || lowAt !== rec.lowBalanceAlertAt || lastLoadAt !== rec.lastLoadAt || (last4 && !rec.last4))
    won = await update(member.id, (m) => {
      // Another pass already moved the markers from what we read: it announced these, we don't.
      if (m.seenTx !== rec.seenTx || m.seenOtp !== rec.seenOtp || m.lowBalanceAlertAt !== rec.lowBalanceAlertAt) return false;
      if (newest !== undefined) m.seenTx = newest;
      else if (m.seenTx === undefined) m.seenTx = "";
      if (freshRows.length) m.seenKeys = [...freshRows.map(txKey), ...(m.seenKeys ?? [])].slice(0, 300);
      if (otp) m.seenOtp = otp;
      if (last4 && !m.last4) m.last4 = last4;
      if (notices.length) m.notices = [...[...notices].reverse(), ...(m.notices ?? [])].slice(0, NOTICE_CAP);
      if (firstPurchaseAt) m.firstPurchaseAt = firstPurchaseAt;
      if (lastLoadAt) m.lastLoadAt = lastLoadAt;
      if (lowAt) m.lowBalanceAlertAt = lowAt;
    });
  if (won) for (const text of tg) void notifyMember(member.id, text);

  // the latest rows, compact and with codes redacted, for support ("double charge" questions)
  const compact = rows.slice(0, 30).map((r) => {
    const code = otpOf(r) !== undefined;
    return { d: r.date, t: r.type, m: code ? "verification code" : r.merchant, a: r.amount, c: r.currency, s: r.status, ...(!code && r.reason ? { r: r.reason } : {}) };
  });
  if (JSON.stringify(compact) !== JSON.stringify(rec.recentRows ?? [])) await update(member.id, (m) => void (m.recentRows = compact));
  return { card, rows, otp: won ? otp : undefined };
}

// ---------- issuing ----------

/** Card is live: tell the member once (in-app notice + Telegram). */
export async function announceIssued(member: Member, cardId: number, loadUsd: number) {
  const at = Date.now();
  const first = await update(member.id, (m) => {
    if (m.issuedNoticeFor === cardId) return false;
    m.issuedNoticeFor = cardId;
    m.notices = [{ id: `issued-${at}`, at, kind: "card" as const, title: "Your card is live", body: `Loaded with ${usd(loadUsd)} by XLM TREASURY.` }, ...(m.notices ?? [])].slice(0, NOTICE_CAP);
  });
  if (first) void notifyMember(member.id, `🎉 <b>Your ${CARD} is live.</b>\nLoaded with <b>${usd(loadUsd)}</b> by XLM TREASURY. Open it in the app to show the details and add it to Apple Pay or Google Pay.`);
}

/**
 * A reserved card: issue it once the owner's load covers it, or adopt a card an earlier attempt bought and
 * didn't save. One process at a time (issuingAt claim, 3 min).
 */
export async function fulfilWaiting(member: Member & { addresses: string[] }): Promise<"issued" | "waiting" | "none" | "failed"> {
  const rec = await record(member.id);
  if (!rec?.requestedAt || rec.cardId) return "none";
  const now = Date.now();
  const claimed = await update(member.id, (m) => {
    if (m.cardId || !m.requestedAt || (m.issuingAt && now - m.issuingAt < 180_000)) return false;
    m.issuingAt = now;
    m.waitTriedAt = now;
  });
  if (!claimed) return "waiting";
  try {
    return await fulfilClaimed(member, rec);
  } finally {
    await update(member.id, (m) => {
      if (m.issuingAt !== now) return false;
      delete m.issuingAt;
    });
  }
}

async function fulfilClaimed(member: Member & { addresses: string[] }, rec: CardCustomer): Promise<"issued" | "waiting" | "none" | "failed"> {
  // The issuer's creation is flaky: after a refusal, retry at most every 10 minutes.
  if (rec.issueErrorAt && Date.now() - rec.issueErrorAt < 600_000) return "failed";
  const load = loadFor(member, await tierOf(member, 600_000));
  // Never buy twice, and check FIRST: an earlier attempt may have bought it and been cut off before saving.
  const have = await listCards(member);
  if (!have.ok) return "waiting";
  const existing = have.data.find(isUsableCard);
  if (existing) {
    await update(member.id, (m) => {
      m.cardId = existing.id;
      m.last4 = existing.last4 ?? m.last4;
      delete m.requestedAt;
      delete m.issueError;
      delete m.issueErrorAt;
    });
    await announceIssued(member, existing.id, typeof existing.balance_usd === "number" && existing.balance_usd > 0 ? existing.balance_usd : load);
    return "issued";
  }
  // Waiting for the owner to load the member's balance at the issuer.
  const bal = await memberBalance(member);
  if (!bal.ok || Number(bal.data.balance ?? 0) < cardCostUsd(load)) return "waiting";
  const r = await issueCard(member, load);
  if (!r.ok && !r.pending) {
    console.error(`[visa] issue for @${member.tag} failed: ${r.status} ${r.message}`);
    await update(member.id, (m) => void ((m.issueError = `${r.status}: ${r.message}`), (m.issueErrorAt = Date.now())));
    return "failed";
  }
  await update(member.id, (m) => {
    delete m.issueError;
    delete m.issueErrorAt;
  });
  const mine = await record(member.id);
  if (!mine?.cardId) return "waiting"; // bought but not listed yet (202): the reservation stays, the next pass adopts it
  await update(member.id, (m) => void delete m.requestedAt);
  await announceIssued(member, mine.cardId, load);
  return "issued";
}

/** Reserve the card and tell the admins once how much to load for it. */
export async function reserve(member: Member, customerId: number, tier: number | null, load: number) {
  let first = false;
  await update(member.id, (m) => {
    if (m.requestedAt) return false;
    m.requestedAt = Date.now();
    first = true;
  });
  if (!first) return;
  const text = `🪙 <b>${CARD} to load</b>\n@${member.tag} (Tier ${tier ?? "?"}) asked for their card. Load <b>${usd(cardCreditUsd(load))}</b> onto issuer customer #${customerId} (${usd(load)} for the card + the issuer's fee). The card issues itself once it lands.`;
  void notifyAdmins(text);
  // Also whoever the card is limited to while testing (they may not hold the admin role).
  const testers = visibleTo().filter((x) => x !== "*");
  for (const u of await db.find("users", "role", "member")) if (named(testers, u)) void notifyMember(u.id, text);
}

/** Reservations, longest-unattended first. */
export async function waitingMembers(): Promise<CardCustomer[]> {
  return (await db.find("cardCustomers", "env", wlMode().mode)).filter((r) => r.requestedAt && !r.cardId).sort((a, b) => (a.waitTriedAt ?? 0) - (b.waitTriedAt ?? 0));
}

/** Everyone with a card in the current environment. */
export async function cardHolders(): Promise<CardCustomer[]> {
  return (await db.find("cardCustomers", "env", wlMode().mode)).filter((r) => r.cardId);
}
