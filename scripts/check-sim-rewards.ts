// Run: node scripts/check-sim-rewards.ts — simulated tier rewards build up right and pay out once.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { convert, toUnits, type Rates } from "../lib/fx.ts";
import { accrualKey, perDayAt } from "../lib/sim-rewards.ts";

process.chdir(mkdtempSync(path.join(tmpdir(), "xlmt-sim-"))); // isolated store
const { db } = await import("../lib/db.ts");
const T = await import("../lib/treasury.ts");

// the owner's table
assert.equal(perDayAt("PROTOCOL26", 1).XLM26, 2_600_000);
assert.equal(perDayAt("PROTOCOL26", 6).XDC26, 5_080_000_000);
assert.equal(perDayAt("PROTOCOL26", 3).GOLD26, 260);
assert.deepEqual(perDayAt("PROTOCOL26", 0), {}, "no tier, no rewards");
assert.deepEqual(perDayAt("DTCCPROTOCOL", 3), {}, "tokens without a table earn nothing");

// accrual: per day, from the start; reading twice adds nothing; a tier change only affects time after it
const DAY = 86_400_000, t0 = Date.UTC(2026, 0, 24);
let a = T.advanceBy(undefined, 2_600_000, t0, t0 + 2 * DAY);
assert.equal(a.accrued, toUnits(5_200_000).toString(), "2 days at Tier 1");
assert.deepEqual(T.advanceBy(a, 2_600_000, t0, t0 + 2 * DAY), a, "same moment: no change");
a = T.advanceBy(a, 13_760_000, t0, t0 + 3 * DAY); // Tier 2 from day 2
assert.equal(a.accrued, toUnits(5_200_000 + 13_760_000).toString());
const big = T.advanceBy(undefined, 5_080_000_000, t0, t0 + 365 * DAY); // Tier 6 XDC26 for a year: beyond 2^63 units
assert.equal(BigInt(big.accrued), BigInt(5_080_000_000 * 365) * 10_000_000n);

// withdraw: value at the tracked price, card-only, once
const rates: Rates = { XLM: 1, USD: 0.2, EUR: 0.18, GBP: 0.15, AUD: 0.3, CAD: 0.28, CHF: 0.16, JPY: 30 };
const base = { accountId: "ann", source: "sim:PROTOCOL26", startAt: t0, now: t0 + DAY };
await T.ensureTreasury(db, "ann");
await assert.rejects(
  T.collect(db, rates, { ...base, accrualKey: accrualKey("PROTOCOL26", "XLM26"), key: "k1-XLM26", tokenPriceXlm: 1, perDay: 2_600_000, unit: "XLM26" }),
  /Create a card first/,
  "card-only: no card, no withdrawal",
);
const card = await T.createCard(db, rates, { accountId: "ann", name: "Vault", design: "silver", currency: "EUR", key: "card-0001" });
const xlm = { ...base, accrualKey: accrualKey("PROTOCOL26", "XLM26"), tokenPriceXlm: 1, perDay: 2_600_000, unit: "XLM26" };
const both = await Promise.allSettled([T.collect(db, rates, { ...xlm, key: "k2-XLM26" }), T.collect(db, rates, { ...xlm, key: "k3-XLM26" })]);
assert.equal(both.filter((r) => r.status === "fulfilled").length, 1, "two simultaneous withdrawals: one pays");
const bal = () => db.get("treasury", "ann").then((t) => BigInt(t!.cards[card.id].balance));
assert.equal(await bal(), convert(toUnits(2_600_000), "XLM", "EUR", rates).units, "1 XLM26 = 1 XLM, converted to the card's EUR");
await T.collect(db, rates, { ...xlm, key: "k2-XLM26" }).catch(() => {});
assert.equal(await bal(), convert(toUnits(2_600_000), "XLM", "EUR", rates).units, "retrying a paid key pays nothing more");

// GOLD26 follows the gold price: 26 oz × $4,000 = $104,000 = 520,000 XLM at $0.20
const before = await bal();
await T.collect(db, rates, { ...base, accrualKey: accrualKey("PROTOCOL26", "GOLD26"), key: "k4-GOLD26", tokenPriceXlm: 4000 / rates.USD, perDay: 26, unit: "GOLD26" });
assert.equal((await bal()) - before, convert(toUnits(520_000), "XLM", "EUR", rates).units);
await assert.rejects(T.collect(db, rates, { ...base, accrualKey: accrualKey("PROTOCOL26", "GOLD26"), key: "k5-GOLD26", tokenPriceXlm: 20000, perDay: 26, unit: "GOLD26" }), /Nothing to collect/);

const m = (await db.find("movements", "accountId", "ann")).find((x) => x.source === "sim:PROTOCOL26");
assert.equal(T.sourceLabel(m!.source), "Withdraw from Protocol 26", "labelled in activity");
console.log("sim-rewards: ok");
