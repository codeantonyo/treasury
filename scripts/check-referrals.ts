// Run: node scripts/check-referrals.ts — referral rewards pay real tokens, so guard the rules.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { User, Wallet } from "../lib/db.ts";
import { qualify, rewardFor } from "../lib/referrals.ts";
import { StellarBusy } from "../lib/stellar.ts";

assert.deepEqual([1, 2, 3, 4, 5, 9].map(rewardFor), [100, 250, 500, 1000, 1000, 1000]);

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
const balances: Record<string, number> = {};
const bought: Record<string, number> = {}; // DEX buys after signup
const chain = {
  holding: async (addrs: string[]) => addrs.reduce((s, a) => s + (balances[a] ?? 0), 0),
  bought: async (addrs: string[]) => addrs.reduce((s, a) => s + (bought[a] ?? 0), 0),
};

await db.tx((t) => t.insert("users", user("boss")));
const invite = async (id: string, o: Partial<User> = {}) => {
  await db.tx(async (t) => {
    await t.insert("users", user(id, { referredBy: "boss", ...o }));
    await t.insert("referrals", { id, referrerId: "boss", status: "pending", createdAt: 0 });
  });
};

// waiting states
await invite("f1", { emailVerified: false });
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "email" });
await db.tx(async (t) => t.put("users", { ...(await t.get("users", "f1"))!, emailVerified: true }));
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "wallet" });
await db.tx((t) => t.insert("wallets", wallet("w1", "f1", "G1")));
balances.G1 = 99.9999999;
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "tier1" });

// Stellar busy: throws, nothing written
await assert.rejects(qualify(db, "f1", { ...chain, holding: async () => { throw new StellarBusy(); } }), StellarBusy);
assert.equal((await db.get("referrals", "f1"))!.status, "pending");

// holding 100 but tokens were moved in, not bought: still pending
balances.G1 = 100;
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "buy" });
bought.G1 = 60;
assert.deepEqual(await qualify(db, "f1", chain), { status: "pending", waitingFor: "buy" });
bought.G1 = 100;

// dry run writes nothing
assert.equal((await qualify(db, "f1", chain, true)).status, "qualified");
assert.equal((await db.get("referrals", "f1"))!.status, "pending");
assert.equal(await db.get("payouts", "ref:f1"), null);

// qualifies once, even if checked many times concurrently
const results = await Promise.all(Array.from({ length: 5 }, () => qualify(db, "f1", chain)));
assert.ok(results.every((r) => r.status === "qualified" && r.amount === 100));
assert.equal((await db.find("payouts", "userId", "boss")).length, 1, "exactly one payout");

// the ladder: 100, 250, 500, 1000, 1000
for (const [i, id] of ["f2", "f3", "f4", "f5"].entries()) {
  await invite(id);
  await db.tx((t) => t.insert("wallets", wallet(`w-${id}`, id, `G-${id}`)));
  balances[`G-${id}`] = 5000;
  bought[`G-${id}`] = 5000;
  assert.equal((await qualify(db, id, chain)).status, "qualified", id);
  assert.equal((await db.get("payouts", `ref:${id}`))!.amount, [250, 500, 1000, 1000][i]);
}
assert.equal((await db.get("users", "boss"))!.qualifiedReferrals, 5);

// same device as the referrer: rejected for good
await invite("sock", { devices: ["dev-boss"] });
await db.tx((t) => t.insert("wallets", wallet("w-sock", "sock", "G-sock")));
balances["G-sock"] = 10_000;
bought["G-sock"] = 10_000;
assert.equal((await qualify(db, "sock", chain)).status, "rejected");
assert.equal(await db.get("payouts", "ref:sock"), null);
assert.equal((await db.get("users", "boss"))!.qualifiedReferrals, 5);

console.log("referrals: ok");
