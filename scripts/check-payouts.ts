// Run: node scripts/check-payouts.ts — referral payouts: holding period, daily cap, never twice, offline.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DAILY_CAP, HOLD_MS, Rejected, runPayouts, type Deps } from "../lib/payouts.ts";

process.chdir(mkdtempSync(path.join(tmpdir(), "xlmt-pay-"))); // isolated store
const { db } = await import("../lib/db.ts");

const DAY = 86_400_000;
let now = Date.parse("2026-10-23T12:00:00Z");
const chain = { sent: [] as { dest: string; amount: number; memo: string }[], landed: new Map<string, string>(), trust: new Set(["GREF1", "GREF2"]), hold: 150, reject: false, crash: false };
const deps: Deps = {
  db,
  now: () => now,
  sentWithMemo: async (memo) => chain.landed.get(memo) ?? null,
  trustline: async (a) => chain.trust.has(a),
  holding: async () => chain.hold,
  async send(dest, amount, memo) {
    if (chain.reject) throw new Rejected('{"transaction":"tx_bad_seq"}');
    const hash = `tx${chain.sent.length + 1}`;
    chain.sent.push({ dest, amount, memo });
    chain.landed.set(memo, hash); // it is on chain now
    if (chain.crash) throw new Error("network dropped after submit");
    return hash;
  },
};

// referrer r1 (wallet GREF1) with friends f1..f3; referrer r2 (GREF2) with friend f4; r3 has no wallet
const w = (id: string, userId: string, address: string) => db.tx((t) => t.insert("wallets", { id, userId, address, primary: true, status: "verified", memo: "", memoAt: 0, proofTx: null, createdAt: 0, verifiedAt: 0 }));
await w("w1", "r1", "GREF1");
await w("w2", "r2", "GREF2");
for (const f of ["f1", "f2", "f3", "f4", "f5"]) await w(`w-${f}`, f, `G${f.toUpperCase()}`);
const queue = async (friend: string, referrer: string, amount: number, qualifiedAt: number) => {
  await db.tx(async (t) => {
    await t.insert("referrals", { id: friend, referrerId: referrer, status: "qualified", amount, createdAt: qualifiedAt, qualifiedAt });
    await t.insert("payouts", { id: `ref:${friend}`, userId: referrer, kind: "referral", amount, status: "queued", memo: `XT-REF-${friend}`, createdAt: qualifiedAt });
  });
};
const status = async (friend: string) => (await db.get("payouts", `ref:${friend}`))!;

// 1. holding period: nothing goes out in the first 7 days
await queue("f1", "r1", 100, now);
await runPayouts(deps);
assert.equal(chain.sent.length, 0);
assert.match((await status("f1")).error ?? "", /holding period/);

// 2. after 7 days it is paid once, to the referrer's wallet, and the referrer is told
now += HOLD_MS + 1;
await runPayouts(deps);
assert.deepEqual(chain.sent, [{ dest: "GREF1", amount: 100, memo: "XT-REF-f1" }]);
assert.equal((await status("f1")).status, "sent");
assert.equal((await db.find("notifications", "userId", "r1")).length, 1);
await runPayouts(deps);
assert.equal(chain.sent.length, 1, "a second run pays nothing more");

// 3. friend sold before payout: waits
await queue("f2", "r1", 250, now - HOLD_MS - 1);
chain.hold = 40;
await runPayouts(deps);
assert.equal(chain.sent.length, 1);
assert.match((await status("f2")).error ?? "", /no longer holds/);
chain.hold = 150;

// 4. dry run reports and changes nothing
const dry = await runPayouts(deps, true);
assert.equal(dry.outcomes.find((o) => o.id === "ref:f2")?.result, "waiting");
assert.equal(chain.sent.length, 1);
assert.equal((await status("f2")).status, "queued");

// 5. no trustline / no wallet: waits and says why
chain.trust.delete("GREF1");
await runPayouts(deps);
assert.match((await status("f2")).error ?? "", /trustline/);
chain.trust.add("GREF1");
await queue("f5", "r3", 100, now - HOLD_MS - 1);
await runPayouts(deps);
assert.match((await status("f5")).error ?? "", /no verified wallet/);
assert.equal((await status("f2")).status, "sent", "f2 paid once the trustline is back");

// 6. daily cap: at most DAILY_CAP in 24 h, the rest continues tomorrow
for (let i = 0; i < 12; i++) await queue(`cap${i}`, "r2", 1000, now - HOLD_MS - 1);
const before = chain.sent.length;
await runPayouts(deps);
const paidToday = chain.sent.slice(before).reduce((s, p) => s + p.amount, 0) + 100 + 250;
assert.ok(paidToday <= DAILY_CAP, `paid ${paidToday} in 24 h`);
assert.match((await status("cap11")).error ?? "", /daily payout limit/);
now += DAY;
await runPayouts(deps);
assert.equal((await status("cap11")).status, "sent", "continues the next day");

// 7. a send that crashes after landing is found on chain next run, never sent twice
await queue("f3", "r1", 500, now - HOLD_MS - 1);
chain.crash = true;
await runPayouts(deps);
chain.crash = false;
assert.equal((await status("f3")).status, "sending");
const sends = chain.sent.length;
await runPayouts(deps);
assert.equal((await status("f3")).status, "sent", "found on chain by its memo");
assert.equal(chain.sent.length, sends, "not sent again");

// 8. rejected by Stellar: back in the queue, paid on a later run
await queue("f4", "r2", 1000, now - HOLD_MS - 1);
chain.reject = true;
await runPayouts(deps);
assert.equal((await status("f4")).status, "queued");
chain.reject = false;
now += DAY;
await runPayouts(deps);
assert.equal((await status("f4")).status, "sent");

// 9. one run at a time
await db.tx(async (t) => t.put("meta", { ...(await t.get("meta", "payout-runner"))!, until: now + 60_000 }));
assert.equal((await runPayouts(deps)).ran, false, "a second concurrent run backs off");
console.log("payouts: ok");
