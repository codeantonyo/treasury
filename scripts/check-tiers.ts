// Run: node scripts/check-tiers.ts — tier boundaries decide who ranks where.
import assert from "node:assert/strict";
import { ladderTier, ladderToNext, LADDERS, tierFor, toNextTier, tierProgress } from "../lib/tiers.ts";

const cases: [number, number][] = [
  [0, 0], [99.9999999, 0], [100, 1], [500, 1], [500.0000001, 2], [501, 2], [1_000, 2], [1_000.5, 3],
  [2_500, 3], [2_501, 4], [5_000, 4], [5_001, 5], [10_000, 5], [20_000, 6], [50_000, 7], [100_000, 8],
  [200_000, 9], [300_000, 10], [399_999.9999999, 11], [400_000, 12], [10_000_000, 12],
];
for (const [bal, want] of cases) assert.equal(tierFor(bal), want, `tierFor(${bal})`);

assert.equal(toNextTier(0), 100);
assert.equal(toNextTier(100), 400.0000001);
assert.equal(toNextTier(4_000), 1_000.0000001);
assert.equal(toNextTier(350_000), 50_000);
assert.equal(toNextTier(400_000), 0);
for (const [bal] of cases) {
  const p = tierProgress(bal);
  assert.ok(p >= 0 && p <= 1, `progress(${bal}) = ${p}`);
  if (tierFor(bal) < 12) assert.equal(tierFor(bal + toNextTier(bal)), tierFor(bal) + 1, `next tier from ${bal}`);
}
console.log("tiers: ok");

// Other tokens' ladders
const rwa = LADDERS.XLMRWA, susd = LADDERS.STELLARUSD, p26 = LADDERS.PROTOCOL26;
assert.deepEqual([99, 100, 500, 500.5, 501, 400_000, 400_000.0000001, 400_001].map((b) => ladderTier(rwa, b)), [0, 1, 1, 2, 2, 11, 12, 12]);
assert.deepEqual([999_999, 1e6, 4_999_999, 5e6, 9_999_999, 1e7, 4e9 - 1, 4e9].map((b) => ladderTier(susd, b)), [0, 1, 1, 2, 2, 3, 11, 12], "touching ranges: boundary goes up");
assert.deepEqual([0.5, 1, 49_999, 49_999.5, 50_000, 4_999_999, 5_000_000].map((b) => ladderTier(p26, b)), [0, 1, 1, 2, 2, 5, 6]);
assert.equal(ladderToNext(susd, 2e6), 3e6);
assert.equal(ladderToNext(p26, 0), 1);
assert.equal(ladderToNext(p26, 6e6), 0);
console.log("ladders: ok");
