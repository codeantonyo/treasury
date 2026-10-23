import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { stellarDeps } from "./payout-stellar";
import { DAILY_CAP, payoutsStale, runPayouts } from "./payouts";
import { convertOld } from "./referrals";
import { firstPurchase } from "./stellar";

/**
 * Automatic referral payouts. Only when PAYOUTS_AUTO=on, PAYOUT_SECRET is set and the app runs on the
 * real database (never from the local test store, whose wallets may belong to strangers).
 */
export const autoPayoutsOn = () => process.env.PAYOUTS_AUTO === "on" && !!process.env.PAYOUT_SECRET && !!process.env.POSTGRES_URL;

/** Runs a payout pass if the last one started over `staleMs` ago. Errors are swallowed: the next pass retries. */
export async function maybeRunPayouts(staleMs = 15 * 60_000) {
  if (!autoPayoutsOn()) return null;
  try {
    if (!(await payoutsStale(db, Date.now(), staleMs))) return null;
    await convertAllOld(); // old-ladder rewards are recalculated before anything is paid
    const deps = stellarDeps(db, process.env.PAYOUT_SECRET!);
    const res = await runPayouts(deps);
    await warnIfLow(deps.balance);
    return res;
  } catch (e) {
    console.error("payouts:", (e as Error).message);
    return null;
  }
}

/** Recalculates every unsent old-ladder reward with the 200% rule (no-op once done). */
export async function convertAllOld(dry = false) {
  const out: Record<string, number> = {};
  for (const r of await db.find("referrals", "status", "qualified")) {
    if (r.rule) continue;
    const res = await convertOld(db, r.id, { firstPurchase }, dry);
    out[res] = (out[res] ?? 0) + 1;
  }
  return out;
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
