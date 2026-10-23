import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { stellarDeps } from "./payout-stellar";
import { DAILY_CAP, payoutsStale, runPayouts } from "./payouts";

/**
 * Automatic referral payouts. Only when PAYOUTS_AUTO=on, PAYOUT_SECRET is set and the app runs on the
 * real database (never from the local test store, whose wallets may belong to strangers).
 */
// Paused in code until the 200% referral rule ships (owner, 2026-10-23): queued rewards from the old
// 100/250/500/1,000 ladder get recalculated first, so nothing may pay under the old amounts.
const RELEASED = false;
export const autoPayoutsOn = () => RELEASED && process.env.PAYOUTS_AUTO === "on" && !!process.env.PAYOUT_SECRET && !!process.env.POSTGRES_URL;

/** Runs a payout pass if the last one started over `staleMs` ago. Errors are swallowed: the next pass retries. */
export async function maybeRunPayouts(staleMs = 15 * 60_000) {
  if (!autoPayoutsOn()) return null;
  try {
    if (!(await payoutsStale(db, Date.now(), staleMs))) return null;
    const deps = stellarDeps(db, process.env.PAYOUT_SECRET!);
    const res = await runPayouts(deps);
    await warnIfLow(deps.balance);
    return res;
  } catch (e) {
    console.error("payouts:", (e as Error).message);
    return null;
  }
}

/** Tells admins in-app, once a day, when the payout wallet can't cover a full day of payouts. */
async function warnIfLow(balance: () => Promise<number>) {
  const left = await balance();
  if (left >= DAILY_CAP) return;
  const id = `low-balance:${new Date().toISOString().slice(0, 10)}`;
  if (await db.get("meta", id)) return;
  const admins = await db.find("users", "role", "admin");
  await db.tx(async (t) => {
    if (await t.get("meta", id)) return;
    await t.insert("meta", { id });
    for (const a of admins)
      await t.insert("notifications", { id: randomUUID(), userId: a.id, at: Date.now(), text: `Payout wallet is low: ${Math.floor(left).toLocaleString("en-US")} XLMTREASURY2 left. Top it up so referral rewards keep going out.`, read: false });
  });
}
