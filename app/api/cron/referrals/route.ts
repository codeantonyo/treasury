import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { qualify } from "@/lib/referrals";
import { boughtSince, StellarBusy, totalHolding } from "@/lib/stellar";

// Re-checks every pending referral. GET /api/cron/referrals[?dry=1]
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
      const res = await qualify(db, r.id, { holding: totalHolding, bought: boughtSince }, dry);
      const key = res.status === "pending" ? `pending:${res.waitingFor}` : res.status;
      counts[key] = (counts[key] ?? 0) + 1;
      if (res.status === "qualified") qualified.push({ invitee: r.id, ordinal: res.ordinal, amount: res.amount });
    } catch (e) {
      if (!(e instanceof StellarBusy)) throw e;
      counts.stellarBusy = (counts.stellarBusy ?? 0) + 1; // nothing written; next run retries
    }
  }
  return Response.json({ dry, checked: pending.length, counts, qualified });
}
