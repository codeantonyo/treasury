"use server";

import { refresh } from "next/cache";
import { CARDS } from "@/lib/cards";
import { db, type CardId, type Pocket } from "@/lib/db";
import { isCurrency, RatesUnavailable, tokenPriceXlm, toUnits, xlmRates } from "@/lib/fx";
import { memberView } from "@/lib/member";
import { requireUser } from "@/lib/session";
import { accrualKey, perDayAt, REWARD_TABLES, SIM_ASSETS, SimPricesUnavailable, simPricesUsd } from "@/lib/sim-rewards";
import { heldSince } from "@/lib/sim-view";
import { StellarBusy, walletAssets } from "@/lib/stellar";
import { LADDERS, ladderTier } from "@/lib/tiers";
import { shortNum } from "@/lib/currencies";
import { checkIn as nextStreak, streakReward, TIER_BOOST, zoneFor } from "@/lib/streak";
import { MAIN_TOKEN } from "@/lib/tokens";
import * as T from "@/lib/treasury";

/** Keeps the member's time zone in step with their device (see zoneFor: not right after a collect). */
export async function syncTimeZone(timeZone: string) {
  const me = await requireUser();
  await db.tx(async (t) => {
    const u = (await t.get("users", me.id))!;
    const tz = zoneFor(u.timeZone, timeZone, u.streak.lastAt, Date.now());
    if (u.timeZone !== tz) await t.put("users", { ...u, timeZone: tz });
  });
}

/**
 * Collect today's streak reward: XLM in-app, only while holding XLMTREASURY2 (read strictly), boosted
 * by tier. One claim per local day (`streak:<user>:<day>`): pay first, then record the day, so a retry
 * after a failure pays nothing twice and still records the streak.
 */
export async function collectStreak(timeZone: string) {
  return run(async () => {
    const me = await requireUser();
    const now = Date.now();
    const tz = zoneFor(me.timeZone, timeZone, me.streak.lastAt, now);
    const next = nextStreak(me.streak, tz, now);
    if (!next) throw new T.MoneyError("Already collected today. Come back tomorrow.");
    const view = await memberView(me);
    if (!view.verified.length) throw new T.MoneyError("Link a Stellar wallet first.");
    if (view.stale) throw new StellarBusy();
    if (view.holding <= 0) throw new T.MoneyError(`Hold ${MAIN_TOKEN.code} in a linked wallet to collect your streak.`);
    const xlm = streakReward(next.count, view.tier);
    await T.creditMember(db, await xlmRates(), {
      accountId: me.id, amount: toUnits(xlm), currency: "XLM", source: "streak", claimId: `streak:${me.id}:${next.lastDay}`,
      memo: `Day ${next.count} · ×${TIER_BOOST[view.tier]} boost`,
    });
    await db.tx(async (t) => {
      const u = (await t.get("users", me.id))!;
      const s = nextStreak(u.streak, tz, now);
      if (s) await t.put("users", { ...u, streak: s, timeZone: tz });
    });
    return `+${shortNum(xlm)} XLM`;
  });
}

// ---------- money: the member says what and where; the server decides and computes ----------

export type MoneyResult = { error?: string; ok?: string; id?: string };

async function run(fn: () => Promise<string | { ok: string; id: string }>): Promise<MoneyResult> {
  try {
    const r = await fn();
    refresh();
    return typeof r === "string" ? { ok: r } : r;
  } catch (e) {
    if (e instanceof T.MoneyError || e instanceof RatesUnavailable || e instanceof StellarBusy || e instanceof SimPricesUnavailable) return { error: e.message };
    throw e;
  }
}

const POCKET_RE = /^(main|card:[a-f0-9]{12})$/;
function asPocket(p: string): Pocket {
  if (!POCKET_RE.test(p)) throw new T.MoneyError("Pick where the money goes.");
  return p as Pocket;
}
function amountOf(v: string) {
  try {
    return toUnits(v.replace(/,/g, ""));
  } catch {
    throw new T.MoneyError("Enter an amount like 12.50");
  }
}

async function unlockedDesigns(): Promise<CardId[]> {
  const me = await requireUser();
  const view = await memberView(me);
  const best = Math.max(me.maxTier, view.tier);
  return CARDS.filter((c) => c.minTier <= Math.max(1, best)).map((c) => c.id); // Silver is open to everyone
}

export async function moveMoney(from: string, to: string, amount: string, key: string) {
  return run(async () => {
    const me = await requireUser();
    await T.transfer(db, await xlmRates(), { accountId: me.id, from: asPocket(from), to: asPocket(to), amount: amountOf(amount), key });
    return "Moved.";
  });
}

export async function sendMoney(toTag: string, from: string, amount: string, key: string) {
  return run(async () => {
    const me = await requireUser();
    const tag = toTag.trim().toLowerCase().replace(/^@/, "");
    const to = (await db.find("users", "tag", tag))[0];
    if (!to) throw new T.MoneyError(`No member is called @${tag}.`);
    await T.send(db, await xlmRates(), { accountId: me.id, toUserId: to.id, from: asPocket(from), amount: amountOf(amount), key, senderTag: me.tag });
    return `Sent to @${to.tag}.`;
  });
}

export async function createCard(name: string, design: string, currency: string, key: string, makeDefault = false) {
  return run(async () => {
    const me = await requireUser();
    if (!isCurrency(currency)) throw new T.MoneyError("Pick a currency.");
    if (!(await unlockedDesigns()).includes(design as CardId)) throw new T.MoneyError("That finish unlocks at a higher tier.");
    const tr = await T.ensureTreasury(db, me.id);
    const card = await T.createCard(db, tr.pending.length ? await xlmRates() : null, { accountId: me.id, name, design: design as CardId, currency, key });
    if (makeDefault) await T.setDefaultDestination(db, me.id, `card:${card.id}`);
    return { ok: `${card.name} card created.`, id: card.id };
  });
}

/** Who is @tag? Only what's shown in the app (name, @username, photo), never the email. */
export async function lookupMember(tag: string): Promise<{ name: string; tag: string; avatar: string | null; self?: boolean } | null> {
  const me = await requireUser();
  const clean = tag.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) return null;
  const u = (await db.find("users", "tag", clean))[0];
  return u ? { name: u.name, tag: u.tag, avatar: u.avatar, self: u.id === me.id } : null;
}

export async function editCard(cardId: string, name: string, design: string) {
  return run(async () => {
    const me = await requireUser();
    if (!(await unlockedDesigns()).includes(design as CardId)) throw new T.MoneyError("That design unlocks at a higher tier.");
    await T.renameCard(db, me.id, cardId, name, design as CardId);
    return "Card updated.";
  });
}

export async function freezeCard(cardId: string) {
  return run(async () => {
    const me = await requireUser();
    await T.freezeCard(db, me.id, cardId);
    return "Card frozen for at least 30 days.";
  });
}

export async function unfreezeCard(cardId: string) {
  return run(async () => {
    const me = await requireUser();
    await T.unfreezeCard(db, me.id, cardId);
    return "Card unfrozen.";
  });
}

export async function closeCard(cardId: string, key: string) {
  return run(async () => {
    const me = await requireUser();
    await T.closeCard(db, await xlmRates(), { accountId: me.id, cardId, key });
    return "Card closed. Its balance moved to your main account.";
  });
}

export async function setRewardDestination(dest: string) {
  return run(async () => {
    const me = await requireUser();
    await T.setDefaultDestination(db, me.id, asPocket(dest));
    return "Saved.";
  });
}

/** Collect tier rewards. The server works out the amount; the member only picks where it goes. */
export async function collectTierRewards(key: string, destination?: string) {
  return run(async () => {
    const me = await requireUser();
    const view = await memberView(me);
    if (view.stale) throw new StellarBusy();
    const [rates, price] = await Promise.all([xlmRates(), tokenPriceXlm()]);
    const r = await T.collect(db, rates, {
      accountId: me.id, source: "tier", key, tokenPriceXlm: price, holding: view.holding, startAt: view.linkedAt,
      destination: destination ? asPocket(destination) : undefined,
    });
    return r.note ?? "Collected.";
  });
}

/**
 * Withdraw  rewards for holding `token` to a card (card-only). The server reads the member's
 * holding and tier from Stellar, moves each reward to now and pays its value at live prices.
 * One claim per reward asset (`key`-asset), so a retry never pays twice.
 */
export async function withdrawSimRewards(token: string, asset: string, key: string, destination?: string) {
  return run(async () => {
    const me = await requireUser();
    if (!REWARD_TABLES[token]) throw new T.MoneyError("This token has no rewards.");
    const list = asset === "all" ? SIM_ASSETS : SIM_ASSETS.filter((a) => a.code === asset);
    if (!list.length) throw new T.MoneyError("Unknown reward.");
    const view = await memberView(me);
    const per = await walletAssets(view.verified.map((w) => w.address)); // strict
    const holding = per.reduce((s, w) => s + (w.balances[token] ?? 0), 0);
    const tier = ladderTier(LADDERS[token], holding);
    const start = await heldSince(me.id, token, per.filter((w) => (w.balances[token] ?? 0) > 0).map((w) => w.address));
    const rates = await xlmRates();
    const prices = await simPricesUsd(rates.USD);
    const perDay = perDayAt(token, tier);
    let paid = 0, note: string | null = null;
    for (const a of list) {
      try {
        const r = await T.collect(db, rates, {
          accountId: me.id,
          source: `sim:${token}`,
          accrualKey: accrualKey(token, a.code),
          key: `${key}-${a.code}`,
          tokenPriceXlm: prices[a.code] / rates.USD,
          perDay: perDay[a.code] ?? 0,
          unit: a.code,
          startAt: start?.at ?? null,
          destination: destination ? asPocket(destination) : undefined,
        });
        paid++;
        note ??= r.note;
      } catch (e) {
        if (!(e instanceof T.MoneyError) || list.length === 1 || !/Nothing to collect/.test(e.message)) throw e;
      }
    }
    if (!paid) throw new T.MoneyError("Nothing to withdraw yet.");
    return note ?? "Withdrawn to your card.";
  });
}

export async function markNotificationsRead() {
  const me = await requireUser();
  const unread = (await db.find("notifications", "userId", me.id)).filter((n) => !n.read);
  if (!unread.length) return;
  await db.tx(async (t) => {
    for (const n of unread) {
      const cur = await t.get("notifications", n.id);
      if (cur && !cur.read) await t.put("notifications", { ...cur, read: true });
    }
  });
  refresh();
}
