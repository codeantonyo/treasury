import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { autoPayoutsOn, convertAllOld, maybeRunPayouts } from "@/lib/payout-runner";
import { stellarDeps } from "@/lib/payout-stellar";
import { runPayouts } from "@/lib/payouts";
import { qualify } from "@/lib/referrals";
import { firstPurchase, StellarBusy } from "@/lib/stellar";

// Re-checks every pending referral, then sends due referral payouts (when PAYOUTS_AUTO=on).
// GET /api/cron/referrals[?dry=1]: dry shows what would qualify and what would be paid, sending nothing.
// Authorization: Bearer CRON_SECRET (Vercel Cron sends it automatically).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Unauthorized", { status: 401 });

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const pending = await db.find("referrals", "status", "pending");
  const counts: Record<string, number> = {};
  const qualified: { invitee: string; ordinal: number; amount: number }[] = [];

  for (const r of pending) {
    try {
      const res = await qualify(db, r.id, { firstPurchase }, dry);
      const key = res.status === "pending" ? `pending:${res.waitingFor}` : res.status;
      counts[key] = (counts[key] ?? 0) + 1;
      if (res.status === "qualified") qualified.push({ invitee: r.id, ordinal: res.ordinal, amount: res.amount });
    } catch (e) {
      if (!(e instanceof StellarBusy)) throw e;
      counts.stellarBusy = (counts.stellarBusy ?? 0) + 1; // nothing written; next run retries
    }
  }
  // Old-ladder rewards not yet sent are recalculated with the 200% rule (dry: just counted).
  const converted = await convertAllOld(dry).catch((e) => (e instanceof StellarBusy ? { stellarBusy: 1 } : Promise.reject(e)));

  // Payouts: dry = report only (reads Stellar, sends nothing); otherwise a real pass when switched on.
  let payouts: unknown = { auto: autoPayoutsOn() };
  if (dry && process.env.PAYOUT_SECRET) {
    const d = stellarDeps(db, process.env.PAYOUT_SECRET);
    payouts = { auto: autoPayoutsOn(), account: d.account, balance: await d.balance().catch(() => null), ...(await runPayouts(d, true)) };
  } else if (!dry) payouts = { auto: autoPayoutsOn(), ...((await maybeRunPayouts(0)) ?? { ran: false }) };
  return Response.json({ dry, checked: pending.length, counts, qualified, converted, payouts });
}
