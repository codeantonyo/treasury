// Daily streak in the member's own time zone. One collect per local day; missing a whole local day
// resets it, except gaps under 40 hours are forgiven (travel, DST). Collecting pays XLM in-app
// (owner's table), only while the member holds XLMTREASURY2, boosted by their XLMTREASURY2 tier.
import type { User } from "./db.ts";

const FORGIVE_MS = 40 * 3600_000;
const DAY_MS = 86_400_000;

/** XLM for days 1–7 (×2, ×3, ×4, ×5, ×6, ×7); day 8 starts the next week at day 1 again. */
export const STREAK_BASE = [100, 200, 600, 2_400, 12_000, 72_000, 504_000];
/** Multiplier by XLMTREASURY2 tier (index = tier; 0 = holds some but below Tier 1). T1–T4 owner's, T5+ placeholder. */
export const TIER_BOOST = [1, 1.5, 2, 5, 12, 30, 75, 150, 300, 600, 1_200, 2_500, 5_000];

/** Day 1–7 of the weekly cycle for the nth day of a streak. */
export const cycleDay = (count: number) => ((count - 1) % 7) + 1;
export const streakReward = (count: number, tier: number) => STREAK_BASE[cycleDay(count) - 1] * TIER_BOOST[tier];

/**
 * The zone a collect is counted in. The device's zone is taken only if the member hasn't collected
 * in the last 24 h, so hopping time zones can't squeeze two "days" into a few hours.
 */
export function zoneFor(stored: string | null, device: string, lastAt: number | null, now: number): string {
  return stored && lastAt !== null && now - lastAt < DAY_MS ? safeZone(stored) : safeZone(device);
}

export function safeZone(tz: string | null | undefined): string {
  try {
    if (tz) return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {}
  return "UTC";
}

/** YYYY-MM-DD in the given zone. */
export const localDay = (tz: string, ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** New streak after collecting at `now`, or null if already collected today. */
export function checkIn(s: User["streak"], tz: string, now: number): User["streak"] | null {
  const today = localDay(tz, now);
  if (s.lastDay === today) return null;
  const continues = s.lastDay === shift(today, -1) || (s.lastAt !== null && now - s.lastAt < FORGIVE_MS);
  return { count: continues ? s.count + 1 : 1, lastDay: today, lastAt: now };
}

/** Current streak as seen now (0 if it has already lapsed). */
export function currentStreak(s: User["streak"], tz: string, now = Date.now()): number {
  if (!s.lastDay) return 0;
  const today = localDay(tz, now);
  const alive = s.lastDay === today || s.lastDay === shift(today, -1) || (s.lastAt !== null && now - s.lastAt < FORGIVE_MS);
  return alive ? s.count : 0;
}

/** Mon..Sun of this local week: "done" | "today" | "future" | "missed". */
export function weekStrip(s: User["streak"], tz: string, now = Date.now()) {
  const today = localDay(tz, now);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  const count = currentStreak(s, tz, now);
  const first = s.lastDay ? shift(s.lastDay, -(count - 1)) : null;
  return Array.from({ length: 7 }, (_, i) => {
    const day = shift(today, i - dow);
    const done = count > 0 && first !== null && day >= first && day <= s.lastDay!;
    if (day === today) return done ? "done" : "today";
    return day > today ? "future" : done ? "done" : "missed";
  });
}

/** What the streak card shows: today's state and the 7 days of the current week of the streak. */
export function streakStatus(s: User["streak"], tz: string, tier: number, now = Date.now()) {
  const next = checkIn(s, tz, now);
  const count = currentStreak(s, tz, now);
  const focus = next ? next.count : count; // the day to collect, or the one collected today
  const start = focus - cycleDay(focus) + 1;
  return {
    count,
    collected: next === null,
    today: streakReward(focus, tier),
    tomorrow: streakReward(focus + 1, tier),
    week: STREAK_BASE.map((_, i) => ({
      day: i + 1,
      xlm: streakReward(start + i, tier),
      state: start + i <= count && (next === null || start + i < focus) ? ("done" as const) : start + i === focus ? ("today" as const) : ("next" as const),
    })),
  };
}
