// Referral payouts in XLMTREASURY2 (on-chain, real tokens). One engine for the automatic runs and the
// owner's script (scripts/pay-referrals.ts). Never pays twice: every payout has a unique memo that is
// looked up on Stellar before sending, each transaction expires after 2 minutes, and only one run
// works at a time (a lease row). Safeguards, all in pay():
//   - a friend's payout waits HOLD_MS after they qualified and is only sent while they still hold 100+
//   - at most DAILY_CAP XLMTREASURY2 leaves in any 24 hours; the rest waits
//   - no verified wallet or no trustline: it waits and says why
// Stellar and sending are passed in (Deps), so scripts/check-payouts.ts tests all of this offline.
import { randomUUID } from "node:crypto";
import type { makeDb, Payout } from "./db.ts";
import { MIN_HOLDING } from "./tiers.ts";

type Db = ReturnType<typeof makeDb>;

export const HOLD_MS = 7 * 86_400_000;
export const DAILY_CAP = 10_000;
const LEASE_MS = 5 * 60_000;
const TX_WINDOW_MS = 120_000 + 300_000; // 120 s validity + 5 min for clock drift

/** A transaction Stellar rejected (it never landed): safe to queue again. */
export class Rejected extends Error {}

export type Deps = {
  db: Db;
  now: () => number;
  /** Already on chain from the payout account with this memo? Returns the hash. */
  sentWithMemo: (memo: string) => Promise<string | null>;
  trustline: (address: string) => Promise<boolean>;
  holding: (addresses: string[]) => Promise<number>;
  /** Sends `amount` XLMTREASURY2 with `memo`; returns the hash. Throws Rejected if Stellar refused it. */
  send: (destination: string, amount: number, memo: string) => Promise<string>;
};

export type Outcome =
  | { id: string; result: "sent" | "already-sent"; amount: number; tx: string }
  | { id: string; result: "waiting"; amount: number; why: string }
  | { id: string; result: "failed"; amount: number; why: string };

/** Pay every queued referral payout that is due. With dry=true nothing is written or sent. */
export async function runPayouts(d: Deps, dry = false, opts: { allowLarge?: boolean } = {}): Promise<{ ran: boolean; outcomes: Outcome[] }> {
  if (!dry && !(await takeLease(d))) return { ran: false, outcomes: [] };
  const outcomes: Outcome[] = [];
  try {
    const due = [...(await d.db.find("payouts", "status", "queued")), ...(await d.db.find("payouts", "status", "sending"))].sort((a, b) => a.createdAt - b.createdAt);
    const sent24h = (await d.db.find("payouts", "status", "sent")).filter((p) => (p.sentAt ?? 0) > d.now() - 86_400_000).reduce((s, p) => s + p.amount, 0);
    let budget = DAILY_CAP - sent24h;
    for (const p of due) {
      const o = await pay(d, p, budget, dry, !!opts.allowLarge);
      if (o.result === "sent" || (o.result === "waiting" && o.why === "would send")) budget -= p.amount;
      outcomes.push(o);
    }
  } finally {
    if (!dry) await releaseLease(d);
  }
  return { ran: true, outcomes };
}

async function pay(d: Deps, p: Payout, budget: number, dry: boolean, allowLarge: boolean): Promise<Outcome> {
  const base = { id: p.id, amount: p.amount };
  const wait = (why: string) => ({ ...base, result: "waiting" as const, why });

  // 1. Already on chain? (a run that stopped after submitting)
  const landed = await d.sentWithMemo(p.memo);
  if (landed) {
    if (!dry) await finish(d, p.id, landed);
    return { ...base, result: "already-sent", tx: landed };
  }
  if (p.status === "sending" && d.now() < (p.sendingUntil ?? 0)) return wait("in flight, checked again next run");

  // 2. Holding period: 7 days after the friend qualified, and they still hold what they bought.
  const ref = await d.db.get("referrals", p.id.replace(/^refb?:/, ""));
  const due = (ref?.qualifiedAt ?? p.createdAt) + HOLD_MS;
  if (d.now() < due) return note(d, p, dry, wait(`holding period until ${new Date(due).toISOString().slice(0, 10)}`));
  if (ref) {
    const friendWallets = (await d.db.find("wallets", "userId", ref.id)).filter((w) => w.status === "verified").map((w) => w.address);
    const kept = ref.purchase?.amount ?? MIN_HOLDING;
    if ((await d.holding(friendWallets)) < kept) return note(d, p, dry, wait(`the invited friend no longer holds the ${kept} XLMTREASURY2 they bought`));
  }

  // 3. Daily cap. A single payout above the cap is never automatic: the owner sends it by hand.
  if (p.amount > DAILY_CAP && !allowLarge) return note(d, p, dry, wait("above the automatic limit, the team sends it by hand"));
  if (p.amount > budget && !allowLarge) return note(d, p, dry, wait("daily payout limit reached, continues tomorrow"));

  // 4. Where to: the referrer's primary verified wallet, which must have the trustline.
  const wallets = (await d.db.find("wallets", "userId", p.userId)).filter((w) => w.status === "verified");
  const dest = (wallets.find((w) => w.primary) ?? [...wallets].sort((a, b) => a.createdAt - b.createdAt)[0])?.address;
  if (!dest) return note(d, p, dry, wait("the member has no verified wallet"));
  if (!(await d.trustline(dest))) return note(d, p, dry, wait("the member's wallet has no XLMTREASURY2 trustline"));
  if (dry) return wait("would send");

  // 5. Claim, send, record.
  const claimed = await d.db.tx(async (t) => {
    const r = await t.get("payouts", p.id);
    if (!r || r.status === "sent" || (r.status === "sending" && d.now() < (r.sendingUntil ?? 0))) return false;
    await t.put("payouts", { ...r, status: "sending", sendingUntil: d.now() + TX_WINDOW_MS, destination: dest });
    return true;
  });
  if (!claimed) return wait("taken by another run");
  try {
    const tx = await d.send(dest, p.amount, p.memo);
    await finish(d, p.id, tx);
    return { ...base, result: "sent", tx };
  } catch (e) {
    // Rejected: it never landed, queue it again. Anything else stays "sending" until the window
    // passes; the next run then finds it on chain or tries again.
    if (e instanceof Rejected)
      await d.db.tx(async (t) => {
        const r = await t.get("payouts", p.id);
        if (r) await t.put("payouts", { ...r, status: "queued", sendingUntil: undefined, error: e.message });
      });
    return { ...base, result: "failed", why: (e as Error).message };
  }
}

/** Mark sent and tell the referrer, once. */
async function finish(d: Deps, id: string, tx: string) {
  await d.db.tx(async (t) => {
    const r = await t.get("payouts", id);
    if (!r || r.status === "sent") return;
    await t.put("payouts", { ...r, status: "sent", txHash: tx, sentAt: d.now(), error: undefined });
    const what = r.kind === "referral-bonus" ? "welcome bonus" : "referral reward";
    await t.insert("notifications", { id: randomUUID(), userId: r.userId, at: d.now(), text: `+${r.amount.toLocaleString("en-US")} XLMTREASURY2 ${what} sent to your wallet`, read: false });
  });
}

/** Remember why a payout is waiting (shown to the member), without rewriting it every run. */
async function note(d: Deps, p: Payout, dry: boolean, o: Outcome & { why: string }) {
  if (!dry && p.error !== o.why)
    await d.db.tx(async (t) => {
      const r = await t.get("payouts", p.id);
      if (r && r.status !== "sent") await t.put("payouts", { ...r, error: o.why });
    });
  return o;
}

async function takeLease(d: Deps) {
  return d.db.tx(async (t) => {
    const l = await t.get("meta", "payout-runner");
    if (l && (l.until ?? 0) > d.now()) return false;
    const row = { ...(l ?? { id: "payout-runner" }), until: d.now() + LEASE_MS, lastRun: d.now() };
    await (l ? t.put("meta", row) : t.insert("meta", row));
    return true;
  });
}

async function releaseLease(d: Deps) {
  await d.db.tx(async (t) => {
    const l = await t.get("meta", "payout-runner");
    if (l) await t.put("meta", { ...l, until: 0 });
  });
}

/** True when the last run started more than `ms` ago (or never ran). */
export async function payoutsStale(db: Db, now: number, ms: number) {
  const l = await db.get("meta", "payout-runner");
  return !l || now - (l.lastRun ?? 0) > ms;
}
