// Run: node scripts/check-streak.ts — one check-in per local day, reset after a missed day, <40 h forgiven.
import assert from "node:assert/strict";
import { checkIn, currentStreak, streakReward, streakStatus, weekStrip, zoneFor } from "../lib/streak.ts";

const H = 3600_000, at = (iso: string) => Date.parse(iso);
let s = { count: 0, lastDay: null as string | null, lastAt: null as number | null };

s = checkIn(s, "UTC", at("2026-10-12T09:00Z"))!;
assert.equal(s.count, 1);
assert.equal(checkIn(s, "UTC", at("2026-10-12T23:00Z")), null, "once per day");
s = checkIn(s, "UTC", at("2026-10-13T08:00Z"))!;
assert.equal(s.count, 2, "next day continues");
assert.equal(checkIn(s, "UTC", at("2026-10-15T08:00Z"))!.count, 1, "a missed day resets");
assert.equal(checkIn(s, "UTC", s.lastAt! + 39 * H)!.count, 3, "gap under 40 h forgiven");
// local day, not UTC: 23:30 in New York is already the next UTC day
const ny = checkIn({ count: 4, lastDay: "2026-10-12", lastAt: at("2026-10-12T14:00Z") }, "America/New_York", at("2026-10-13T03:30Z"));
assert.equal(ny, null, "still Oct 12 in New York");
assert.equal(currentStreak(s, "UTC", at("2026-10-16T08:00Z")), 0, "lapsed streak shows 0");
assert.deepEqual(weekStrip(s, "UTC", at("2026-10-14T10:00Z")), ["done", "done", "today", "future", "future", "future", "future"]);

// rewards: owner's table (100, ×2, ×3, ×4, ×5, ×6, ×7), weekly cycle, tier boost
assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((d) => streakReward(d, 0)), [100, 200, 600, 2_400, 12_000, 72_000, 504_000]);
assert.equal(streakReward(8, 0), 100, "day 8 starts the next week");
assert.equal(streakReward(1, 1), 150, "Tier 1 ×1.5");
assert.equal(streakReward(1, 2), 200, "Tier 2 ×2");
assert.equal(streakReward(2, 3), 1_000, "Tier 3 ×5");
assert.equal(streakReward(1, 4), 1_200, "Tier 4 ×12");
const st = streakStatus(s, "UTC", 1, s.lastAt! + 20 * H); // day 2 collected, day 3 open
assert.equal(st.collected, false);
assert.equal(st.today, 900);
assert.deepEqual(st.week.map((d) => d.state), ["done", "done", "today", "next", "next", "next", "next"]);
assert.equal(streakStatus(s, "UTC", 1, s.lastAt! + H).collected, true);
// no time-zone hopping right after a collect
assert.equal(zoneFor("UTC", "Pacific/Kiritimati", at("2026-10-13T08:00Z"), at("2026-10-13T12:00Z")), "UTC");
assert.equal(zoneFor("UTC", "Pacific/Kiritimati", at("2026-10-13T08:00Z"), at("2026-10-14T09:00Z")), "Pacific/Kiritimati");
console.log("streak: ok");
