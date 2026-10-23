// Run: node scripts/check-referrals.ts — referral bonuses pay real tokens, so guard the rules:
// first purchase (≥100 XLM) after signing up → 200% of it to the referrer AND the friend, once.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { User, Wallet } from "../lib/db.ts";
import { bonusFor, convertOld, MIN_PURCHASE_XLM, qualify, type Chain } from "../lib/referrals.ts";
import { StellarBusy, type Purchase } from "../lib/stellar.ts";

assert.equal(bonusFor(500), 1000, "you purchase 500, you both receive 1000");
assert.equal(bonusFor(250), 500, "referral purchases 250, you both receive 500");
assert.equal(bonusFor(0.12345678), 0.2469136, "7 decimals");

process.chdir(mkdtempSync(path.join(tmpdir(), "xlmt-ref-"))); // isolated JSON store
const { db } = await import("../lib/db.ts");

const user = (id: string, o: Partial<User> = {}): User => ({
  id, email: `${id}@x.io`, emailVerified: true, passwordHash: "x", name: id, tag: id, avatar: null, role: "member",
  referralCode: `R-${id}`, referredBy: null, devices: [`dev-${id}`], sessionEpoch: 0, failedLogins: 0, lockedUntil: null,
  prefs: { hideBalances: false, emailNotifs: true, tgNotifs: true }, timeZone: null,
  streak: { count: 0, lastDay: null, lastAt: null }, maxTier: 0, lastHolding: null, qualifiedReferrals: 0, createdAt: 0, ...o,
});
const wallet = (id: string, userId: string, address: string): Wallet => ({
  id, userId, address, primary: true, status: "verified", memo: "", memoAt: 0, proofTx: null, createdAt: 0, verifiedAt: 0,
});
// each wallet's DEX purchases (amount of tokens, XLM paid, when)
const buys: Record<string, Purchase[]> = {};
let busy = false;
const chain: Chain = {
  firstPurchase: async (addrs, since, minXlm) => {
    if (busy) throw new StellarBusy();
    return addrs.flatMap((a) => buys[a] ?? []).filter((p) => p.at >= since).sort((a, b) => a.at - b.at).find((p) => p.xlm >= minXlm) ?? null;
  },
};

await db.tx((t) => t.insert("users", user("boss")));
const invite = async (id: string, o: Partial<User> = {}) => {
  await db.tx(async (t) => {
    await t.insert("users", user(id, { referredBy: "boss", createdAt: 1000, ...o }));
    await t.insert("referrals", { id, referrerId: "boss", status: "pending", createdAt: 1000 });
  });
};

// waiting states
await invite("f1", { emailVerified: false });
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "email" });
await db.tx(async (t) => t.put("users", { ...(await t.get("users", "f1"))!, emailVerified: true }));
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "wallet" });
await db.tx((t) => t.insert("wallets", wallet("w1", "f1", "G1")));
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "buy" });

// bought before signing up: doesn't count; a purchase under 100 XLM doesn't count
buys.G1 = [{ amount: 900, xlm: 400, at: 500 }, { amount: 50, xlm: MIN_PURCHASE_XLM - 1, at: 2000 }];
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "buy" });

// Stellar busy: throws, nothing written
buys.G1.push({ amount: 500, xlm: 120, at: 3000 }, { amount: 9000, xlm: 2000, at: 4000 });
busy = true;
await assert.rejects(qualify(db, "f1", chain), StellarBusy);
busy = false;
assert.equal((await db.get("referrals", "f1"))!.status, "pending");

// dry run writes nothing
assert.deepEqual(await qualify(db, "f1", chain, true), { status: "qualified", ordinal: 1, amount: 1000 });
assert.equal(await db.get("payouts", "ref:f1"), null);

// the first qualifying purchase (500) counts, not the bigger later one; both sides get 1000, once
const results = await Promise.all(Array.from({ length: 5 }, () => qualify(db, "f1", chain)));
assert.ok(results.every((r) => r.status === "qualified" && r.amount === 1000));
const toBoss = await db.get("payouts", "ref:f1"), toFriend = await db.get("payouts", "refb:f1");
assert.deepEqual([toBoss?.userId, toBoss?.amount, toBoss?.kind], ["boss", 1000, "referral"]);
assert.deepEqual([toFriend?.userId, toFriend?.amount, toFriend?.kind], ["f1", 1000, "referral-bonus"]);
assert.equal((await db.find("payouts", "status", "queued")).length, 2, "exactly two payouts");
assert.equal((await db.get("referrals", "f1"))!.purchase?.amount, 500);

// same device as the referrer: rejected for good
await invite("sock", { devices: ["dev-boss"] });
await db.tx((t) => t.insert("wallets", wallet("w-sock", "sock", "G-sock")));
buys["G-sock"] = [{ amount: 10_000, xlm: 5000, at: 2000 }];
assert.equal((await qualify(db, "sock", chain)).status, "rejected");
assert.equal(await db.get("payouts", "ref:sock"), null);

// old-ladder rewards (owner: recalculate with 200%): unsent → recalculated, sent → kept, no purchase → pending again
const oldLadder = async (id: string, amount: number, status: "queued" | "sent") => {
  await db.tx(async (t) => {
    await t.insert("users", user(id, { referredBy: "boss", createdAt: 1000 }));
    await t.insert("wallets", wallet(`w-${id}`, id, `G-${id}`));
    await t.insert("referrals", { id, referrerId: "boss", status: "qualified", ordinal: 9, amount, createdAt: 1000, qualifiedAt: 5000 });
    await t.insert("payouts", { id: `ref:${id}`, userId: "boss", kind: "referral", amount, status, memo: `XT-REF-${id}`, createdAt: 5000 });
    const b = (await t.get("users", "boss"))!;
    await t.put("users", { ...b, qualifiedReferrals: b.qualifiedReferrals + 1 });
  });
};
await oldLadder("o1", 250, "queued");
buys["G-o1"] = [{ amount: 300, xlm: 150, at: 2000 }];
assert.equal(await convertOld(db, "o1", chain, true), "converted");
assert.equal((await db.get("payouts", "ref:o1"))!.amount, 250, "dry run changes nothing");
assert.equal(await convertOld(db, "o1", chain), "converted");
assert.equal((await db.get("payouts", "ref:o1"))!.amount, 600);
assert.equal((await db.get("payouts", "refb:o1"))!.amount, 600);
assert.equal(await convertOld(db, "o1", chain), "skip", "only once");

await oldLadder("o2", 100, "sent");
assert.equal(await convertOld(db, "o2", chain), "kept");
assert.equal(await db.get("payouts", "refb:o2"), null);

await oldLadder("o3", 500, "queued");
const before = (await db.get("users", "boss"))!.qualifiedReferrals;
assert.equal(await convertOld(db, "o3", chain), "back-to-pending");
assert.equal((await db.get("referrals", "o3"))!.status, "pending");
assert.equal(await db.get("payouts", "ref:o3"), null);
assert.equal((await db.get("users", "boss"))!.qualifiedReferrals, before - 1);

console.log("referrals: ok");
