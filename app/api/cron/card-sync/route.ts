import { timingSafeEqual } from "node:crypto";
import { ops, setOps, wlMode } from "@/lib/visa/issuer";
import { cardHolders, fulfilWaiting, memberOf, syncCard, waitingMembers } from "@/lib/visa/sync";

/**
 * GET /api/cron/card-sync, every 2 minutes (vercel.json). The issuer has no transaction webhook, so this
 * is how members hear about payments and get their one-time codes (Apple/Google Pay, 3-D Secure) when the
 * card page isn't open, and how the owner's loads get announced. Then it works reservations (issues a card
 * as soon as the owner's load for it lands).
 * Authorization: Bearer CRON_SECRET. Progress goes to the "card-ops" row (logs aren't reachable from support).
 */
export const maxDuration = 120;

const LOGIN_BUDGET = 3; // password sign-ins per pass: the issuer's sign-in limit is shared by all our customers

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Unauthorized", { status: 401 });
  if (!wlMode().key) return Response.json({ ok: true, skipped: wlMode().problem });

  const at = Date.now();
  const mark = (cron: { phase: string; ms?: number; error?: string; waiting?: number; holders?: number }) => setOps((o) => void (o.cron = { at, ...cron })).catch(() => {});
  try {
    await mark({ phase: "started" });
    const out: Record<string, string> = {};
    const all = await cardHolders();
    const paused = ((await ops()).loginPauseUntil ?? 0) > at;
    // A live session or a stored refresh token syncs every pass; cards that need a password sign-in are rationed.
    const canSync = (r: (typeof all)[number]) => (r.tokenExp ?? 0) > at + 60_000 || !!r.refreshToken;
    const live = all.filter(canSync);
    const needLogin = all
      .filter((r) => !canSync(r) && !(r.loginRetryAt && at < r.loginRetryAt))
      .sort((a, b) => (a.tokenExp ?? 0) - (b.tokenExp ?? 0))
      .slice(0, paused ? 0 : LOGIN_BUDGET);
    const list = [...live, ...needLogin];
    // Start further along each pass so a slow pass doesn't always restart on the same cards.
    const offset = list.length ? (Math.floor(at / 120_000) * 20) % list.length : 0;
    const holders = [...list.slice(offset), ...list.slice(0, offset)];
    for (let i = 0; i < holders.length; i += 5) {
      if (Date.now() - at > 40_000) break;
      await Promise.all(
        holders.slice(i, i + 5).map(async (r) => {
          const member = await memberOf(r.id);
          if (!member) return;
          try {
            const s = await syncCard(member);
            out[member.tag] = s.failed ? "unreachable" : `${s.rows.length} rows${s.otp ? ", otp" : ""}`;
          } catch (e) {
            out[member.tag] = `error: ${(e as Error).message}`;
          }
        }),
      );
    }
    if (all.length) {
      const failed = Object.values(out).filter((v) => /^unreachable|^error/.test(v)).length;
      const loginErrors = all.filter((r) => r.loginError).length;
      await setOps((o) => void (o.health = { at: Date.now(), total: all.length, synced: holders.length, failed, loginErrors }));
    }
    // Reservations in the time left, 3 at a time, longest-unattended first; never start one near the limit.
    const waiting = await waitingMembers();
    for (let i = 0; i < waiting.length; i += 3) {
      if (Date.now() - at > 90_000) {
        for (const r of waiting.slice(i)) out[`waiting:${r.id}`] = "deferred (time budget)";
        break;
      }
      await Promise.all(
        waiting.slice(i, i + 3).map(async (r) => {
          const member = await memberOf(r.id);
          if (!member) return;
          try {
            out[`waiting:${member.tag}`] = await fulfilWaiting(member);
          } catch (e) {
            out[`waiting:${member.tag}`] = `error: ${(e as Error).message}`;
          }
        }),
      );
    }
    await mark({ phase: "done", ms: Date.now() - at, waiting: waiting.length, holders: all.length });
    return Response.json({ ok: true, mode: wlMode().mode, cards: all.length, synced: holders.length, paused, waiting: waiting.length, out });
  } catch (e) {
    await mark({ phase: "crashed", ms: Date.now() - at, error: `${(e as Error).name}: ${(e as Error).message}` });
    throw e;
  }
}
