// Run: node scripts/check-treasury.ts — in-app money rules (owner's money brief). Isolated temp store.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { convert, toUnits, type Rates } from "../lib/fx.ts";

process.chdir(mkdtempSync(path.join(tmpdir(), "xlmt-treasury-"))); // never the project or production DB
const { db } = await import("../lib/db.ts");
const T = await import("../lib/treasury.ts");

const rates: Rates = { XLM: 1, USD: 0.2, EUR: 0.18, GBP: 0.15, AUD: 0.3, CAD: 0.28, CHF: 0.16, JPY: 30 };
const xlmValueOf = async (ids: string[]) => {
  let total = 0n;
  for (const id of ids) {
    const tr = (await db.get("treasury", id))!;
    total += BigInt(tr.main.balance);
    for (const c of Object.values(tr.cards)) total += convert(BigInt(c.balance), c.currency, "XLM", rates).units;
  }
  return total;
};
const bal = async (id: string, p: string) => T.pocket((await db.get("treasury", id))!, p).balance;
let k = 0;
const key = () => `key-${String(++k).padStart(6, "0")}`;

// setup: two members, Ann has an XLM card and a EUR card
const eur = await T.createCard(db, rates, { accountId: "ann", name: "Travel", design: "silver", currency: "EUR", key: key() });
const gold = await T.createCard(db, rates, { accountId: "ann", name: "Gold", design: "violet", currency: "XLM", key: key() });
await T.ensureTreasury(db, "bob");
await T.creditMember(db, rates, { accountId: "ann", amount: toUnits(1000), currency: "XLM", source: "admin", claimId: "seed-ann" });

// 2. same claim id twice pays once (also concurrently)
await Promise.all([1, 2, 3].map(() => T.creditMember(db, rates, { accountId: "ann", amount: toUnits(1000), currency: "XLM", source: "admin", claimId: "seed-ann" })));
assert.equal(await bal("ann", "main"), toUnits(1000), "claim paid once");

// 1. money is conserved by transfers (own pockets, cross-currency, and to another member)
const before = await xlmValueOf(["ann", "bob"]);
await T.transfer(db, rates, { accountId: "ann", from: "main", to: `card:${eur.id}`, amount: toUnits(300), key: key() });
await T.transfer(db, rates, { accountId: "ann", from: `card:${eur.id}`, to: `card:${gold.id}`, amount: toUnits(9), key: key() });
await T.send(db, rates, { accountId: "ann", toUserId: "bob", from: `card:${gold.id}`, amount: toUnits(20), key: key(), senderTag: "ann" });
const after = await xlmValueOf(["ann", "bob"]);
assert.ok(after - before >= -3n && after - before <= 3n, `transfers conserve value (drift ${after - before} units from FX rounding)`);
assert.equal(await bal("ann", `card:${eur.id}`), toUnits(300 * 0.18) - toUnits(9));
assert.equal(await bal("bob", "main"), convert(toUnits(20), "XLM", "XLM", rates).units);

// 2b. the same request key twice moves money once (double tap / second device)
const k1 = key();
await Promise.all([1, 2].map(() => T.transfer(db, rates, { accountId: "ann", from: "main", to: `card:${gold.id}`, amount: toUnits(10), key: k1 })));
assert.equal(await bal("ann", "main"), toUnits(1000 - 300 - 10), "one transfer applied");

// 6. never below zero
const mainNow = await bal("ann", "main");
await assert.rejects(T.transfer(db, rates, { accountId: "ann", from: "main", to: `card:${gold.id}`, amount: mainNow + 1n, key: key() }), T.MoneyError);
await assert.rejects(T.send(db, rates, { accountId: "bob", toUserId: "ann", from: "main", amount: toUnits(21), key: key(), senderTag: "bob" }), T.MoneyError);
assert.equal(await bal("ann", "main"), mainNow, "refused transfer changed nothing");

// 4. closing a card moves its exact (converted) balance to main, as one movement
const eurBal = await bal("ann", `card:${eur.id}`);
const mainBefore = await bal("ann", "main");
const close = await T.closeCard(db, rates, { accountId: "ann", cardId: eur.id, key: key() });
assert.equal(await bal("ann", "main"), mainBefore + convert(eurBal, "EUR", "XLM", rates).units);
assert.equal(close!.sent!.amount, eurBal.toString());
const closed = (await db.get("treasury", "ann"))!.cards[eur.id];
assert.equal(closed.status, "closed");
assert.equal(closed.balance, "0");

// 5. frozen default card: reward lands in main (normal reward) / another active card (card-only)
await T.setDefaultDestination(db, "ann", `card:${gold.id}`);
await T.freezeCard(db, "ann", gold.id);
const m0 = await bal("ann", "main");
const r = await T.creditMember(db, rates, { accountId: "ann", amount: toUnits(5), currency: "XLM", source: "streak", claimId: "streak-1" });
assert.equal(r.to, "main");
assert.match(r.note!, /Gold card is frozen/);
assert.equal(await bal("ann", "main"), m0 + toUnits(5));
await assert.rejects(T.unfreezeCard(db, "ann", gold.id), T.MoneyError, "30-day freeze");
// card-only reward with no active card: held, never dropped; delivered when a card is created
const held = await T.creditMember(db, rates, { accountId: "ann", amount: toUnits(7), currency: "XLM", source: "airdrop", claimId: "drop-1" });
assert.ok(held.held);
const fresh = await T.createCard(db, rates, { accountId: "ann", name: "New", design: "silver", currency: "XLM", key: key() });
assert.equal(await bal("ann", `card:${fresh.id}`), toUnits(7), "held airdrop delivered to the new card");
assert.equal((await db.get("treasury", "ann"))!.pending.length, 0);
await T.creditMember(db, rates, { accountId: "ann", amount: toUnits(7), currency: "XLM", source: "airdrop", claimId: "drop-1" });
assert.equal(await bal("ann", `card:${fresh.id}`), toUnits(7), "delivered airdrop not paid again");

// 7. accrual: never shrinks when holdings drop, never doubles on a second read
const DAY = 86_400_000, t0 = Date.UTC(2026, 9, 1);
let a = T.advance(undefined, 1000, t0, t0 + DAY, 0.001);
assert.equal(a.accrued, toUnits(1).toString(), "1000 × 0.1% × 1 day");
assert.deepEqual(T.advance(a, 1000, t0, t0 + DAY, 0.001), a, "same moment twice: no change");
const high = BigInt(a.accrued);
a = T.advance(a, 10, t0, t0 + 2 * DAY, 0.001); // holdings dropped
assert.ok(BigInt(a.accrued) >= high, "never shrinks");
assert.equal(T.advance(undefined, 1000, null, t0, 0.001).accrued, "0", "no linked wallet: nothing accrues");

// 3. collecting more than is ready is refused, including two collects at once
const now = t0 + 10 * DAY;
const base = { accountId: "ann", source: "tier", tokenPriceXlm: 0.5, holding: 1000, startAt: t0, now };
await assert.rejects(T.collect(db, rates, { ...base, key: key(), amount: toUnits(11) }), T.MoneyError, "10 days × 1 = 10 ready");
const both = await Promise.allSettled([T.collect(db, rates, { ...base, key: key() }), T.collect(db, rates, { ...base, key: key() })]);
assert.equal(both.filter((x) => x.status === "fulfilled").length, 1, "only one of two simultaneous collects pays");
const acc = (await db.get("treasury", "ann"))!.accruals.tier;
assert.equal(acc.collected, toUnits(10).toString());
assert.equal(await bal("ann", `card:${fresh.id}`), toUnits(7) + toUnits(5), "10 XLMTREASURY2 × 0.5 XLM to the (card-only) card");

console.log("treasury: ok");
