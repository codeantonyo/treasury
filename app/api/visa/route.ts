import { currentUser } from "@/lib/session";
import { notifyMember } from "@/lib/notify";
import { announceIssued, CARD, eligibility, fulfilWaiting, loadFor, memberOf, reserve, syncCard } from "@/lib/visa/sync";
import { cardDetails, cardSecrets, closeCard, ensureCustomer, freezeCard, fundMember, issueCard, listCards, memberBalance, ops, record, update, wlMode, type WlCard } from "@/lib/visa/issuer";
import { CARD_MIN_TIER, cardCostUsd, cardLoadUsd, cardNameOf, declineReason, isLoadRow, isMobile, isPumpHold, isUsableCard, isZeroVerification, otpOf, settledAuths, txKey, txStatus, usd, type WlTransaction } from "@/lib/visa/pure";
import type { CardCustomer } from "@/lib/db";

/**
 * /api/visa: the member's StellarPay Visa (real card). Session-scoped: everything runs as the signed-in
 * member against THEIR issuer customer, never from a request parameter. Separate from the in-app cards.
 * The owner loads members by hand at the issuer; members issue, reveal, freeze and close; the app reads
 * the card, its balance and every movement back automatically.
 */
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const WAITING_CARD = { id: "waiting", status: "Waiting to be loaded", frozen: false, pending: false, waiting: true, detailsReady: false };

/** "12/30" → "2030-12"; anything else passes through. */
const toYm = (e?: string) => (e && /^\d{2}\/\d{2}$/.test(e) ? `20${e.slice(3)}-${e.slice(0, 2)}` : e);

/** Issuer rows carry "2026-08-14 10:22:05" with no zone; it's UTC. Make it ISO so browsers don't read it as local time. */
const isoOf = (d?: string) => (d && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(d) ? `${d.replace(" ", "T")}Z` : (d ?? ""));

/** The card as the app shows it; when the issuer's read fails, what we have on record (never "no card"). */
function cardView(c: WlCard | undefined, rec?: CardCustomer) {
  if (!c && rec?.cardId) return { id: String(rec.cardId), last4: rec.last4, status: undefined, expiry: toYm(rec.expiry), frozen: false, pending: false, waiting: false, detailsReady: true };
  if (!c) return null;
  return {
    id: String(c.id),
    last4: c.last4 ?? rec?.last4,
    status: c.status === "frozen" ? "Frozen" : c.status === "active" ? "Active" : c.status,
    expiry: toYm(rec?.expiry),
    frozen: c.status === "frozen",
    pending: !!c.status && !["active", "frozen", "closed"].includes(c.status),
    waiting: false,
    detailsReady: c.live_details_available !== false && (!c.status || ["active", "frozen"].includes(c.status)),
  };
}

/** The card's own rows, one line per payment; the owner's loads appear as "Loaded by XLM TREASURY". */
function activityRows(rows: WlTransaction[]) {
  const settled = settledAuths(rows);
  return rows
    .filter((t) => !settled.has(t))
    .map((t) => {
      const code = otpOf(t);
      const load = isLoadRow(t) && !/refund/i.test(t.type ?? "");
      const merchant = (t.merchant ?? "").trim() || t.type || "Card payment";
      const dead = ["declined", "failed"].includes(txStatus(t.status));
      const why = dead ? declineReason(t.reason, merchant) : null;
      return {
        id: `k-${txKey(t)}`,
        merchant: code !== undefined ? "Verification code" : load ? "Loaded by XLM TREASURY" : merchant,
        amount: Math.abs(Number(t.amount ?? 0)),
        currency: t.currency ?? "USD",
        at: isoOf(t.date),
        group: load ? "Deposit" : /refund/i.test(t.type ?? "") || txStatus(t.status) === "reversed" ? "Refund" : "Purchase",
        status: txStatus(t.status),
        kind: code !== undefined ? "otp" : load ? "load" : "payment",
        ...(code ? { code } : {}),
        ...(isPumpHold(t)
          ? { note: "Temporary pump hold: settles to what you pumped" }
          : isZeroVerification(t) && code === undefined
            ? { note: "Card check: nothing was charged" }
            : why
              ? { note: why.title, hint: why.hint }
              : txStatus(t.status) === "reversed"
                ? { note: "Reversed: the money is back on your card" }
                : {}),
      };
    })
    .slice(0, 60);
}

async function signedIn() {
  const u = await currentUser();
  return u ? memberOf(u.id) : null;
}

/** "The card network is slow" when the last cron pass couldn't reach many cards. */
async function networkSlow() {
  const h = (await ops()).health;
  return !!h && Date.now() - h.at < 10 * 60_000 && h.total > 0 && (h.failed + h.loginErrors) / h.total > 0.3;
}

export async function GET() {
  const member = await signedIn();
  if (!member) return json({ error: "unauthorized" }, 401);
  if (!wlMode().key) return json({ enabled: false, eligible: false, card: null });
  const { eligible, visible, tier } = await eligibility(member);
  if (!visible) return json({ enabled: false, eligible: false, card: null }); // their tier's wave isn't out yet
  const base = { enabled: true, eligible, tier, minTier: CARD_MIN_TIER, loadUsd: loadFor(member, tier), nextTierLoad: cardLoadUsd(Math.max(CARD_MIN_TIER, (tier ?? 0) + 1)), hasWallet: member.addresses.length > 0 };
  let rec = await record(member.id);
  if (!eligible || !rec || rec.customerId === 0) return json({ ...base, card: null });

  if (rec.requestedAt && !rec.cardId) await fulfilWaiting(member);
  rec = (await record(member.id)) ?? rec;
  const card = rec.cardId ? await cardDetails(member, rec.cardId) : null;
  const c = card?.ok ? card.data : undefined;
  const onCard = c && typeof c.balance_usd === "number" ? c.balance_usd : null;
  if (onCard !== null && onCard !== rec.lastBalance) await update(member.id, (m) => void (m.lastBalance = onCard));
  const view = cardView(c, rec);
  const issuedAt = rec.walletAt ?? rec.createdAt;
  return json({
    ...base,
    available: rec.cardId ? (onCard ?? rec.lastBalance ?? null) : null,
    card: view ?? (rec.requestedAt ? WAITING_CARD : null),
    balanceSource: c?.balance_source ?? null,
    balanceAsOf: c?.balance_as_of ?? null,
    progress: {
      loaded: !!rec.cardId,
      creating: !rec.cardId && !!rec.issuingAt && Date.now() - rec.issuingAt < 180_000,
      created: !!rec.cardId,
      active: !!view && !view.pending && !view.waiting,
      wallet: !!rec.wallet,
      delayed: !!rec.cardId && (!card?.ok || !!rec.loginError),
      stalled: !!view?.pending && Date.now() - issuedAt > 86_400_000,
    },
    slow: await networkSlow(),
    wallet: rec.wallet ?? null,
    notices: rec.notices ?? [],
  });
}

/** A double tap can't issue twice (per instance; the issuer side is covered by adopt-before-buy). */
const inflight = new Set<string>();

export async function POST(req: Request) {
  const member = await signedIn();
  if (!member) return json({ error: "unauthorized" }, 401);
  if (!wlMode().key) return json({ ok: false, message: `${CARD} isn't available yet.` }, 403);
  if (!(await eligibility(member)).eligible) return json({ ok: false, message: `${CARD} isn't available for your tier yet.` }, 403);

  let b: { action?: string; mobile?: string; cardName?: string; wallet?: string; id?: string };
  try {
    b = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const mobileIn = (b.mobile ?? "").replace(/[\s()-]/g, "");
  if (mobileIn && !isMobile(mobileIn)) return json({ ok: false, message: "Mobile must be in international format, e.g. +14155551234." }, 400);
  const rec = await record(member.id);

  switch (b.action) {
    case "set-mobile": {
      if (!mobileIn || !rec) return json({ ok: false, message: "Mobile required." }, 400);
      await update(member.id, (m) => void (m.mobile = mobileIn));
      return json({ ok: true, mobile: mobileIn });
    }

    case "issue": {
      if (!member.addresses.length) return json({ ok: false, message: "Link and verify a Stellar wallet first." }, 400);
      if (!mobileIn && !rec?.mobile) return json({ ok: false, message: "A mobile number is required to issue your card." }, 400);
      const cardName = b.cardName ? cardNameOf(b.cardName) : null;
      if (!rec?.cardId && !cardName && !rec?.cardName) return json({ ok: false, message: "Enter your legal first and last name, exactly as on your ID." }, 400);
      if (inflight.has(member.id)) return json({ ok: false, message: "Already in progress." });
      inflight.add(member.id);
      try {
        const cust = await ensureCustomer(member, mobileIn || rec?.mobile);
        if ("error" in cust) return json({ ok: false, message: cust.error });
        await update(member.id, (m) => {
          if (mobileIn) m.mobile = mobileIn;
          if (cardName && !m.cardId) m.cardName = cardName; // an issued card's name can't change
        });
        let mine = (await record(member.id)) ?? cust;
        // An earlier attempt bought the card and was cut off before saving it: adopt, never buy again.
        if (!mine.cardId && (await listCards(member)).data.some(isUsableCard)) {
          await update(member.id, (m) => void (m.requestedAt ??= Date.now()));
          await fulfilWaiting(member);
          mine = (await record(member.id)) ?? mine;
        }
        if (!mine.cardId) {
          const { tier } = await eligibility(member);
          const load = loadFor(member, tier);
          if (wlMode().mode === "sandbox") await fundMember(member, Math.ceil(cardCostUsd(load))); // fake money
          const bal = await memberBalance(member);
          if (!bal.ok || Number(bal.data.balance ?? 0) < cardCostUsd(load)) {
            // Not loaded yet: reserve it and tell the owner what to load; it issues itself once that lands.
            await reserve(member, cust.customerId, tier, load);
            return json({ ok: true, waiting: true, card: WAITING_CARD });
          }
          const r = await issueCard(member, load);
          if (!r.ok && !r.pending) return json({ ok: false, message: r.status === 402 ? "Your card isn't loaded yet. It issues itself as soon as it is." : r.message });
          mine = (await record(member.id)) ?? mine;
          if (!mine.cardId) {
            await update(member.id, (m) => void (m.requestedAt ??= Date.now())); // bought, not listed yet: the cron adopts it
            return json({ ok: true, waiting: true, card: WAITING_CARD });
          }
          await announceIssued(member, mine.cardId, load);
        }
        const c = mine.cardId ? await cardDetails(member, mine.cardId) : null;
        if (mine.cardId && !mine.expiry) {
          const s = await cardSecrets(member, mine.cardId);
          if (s.ok && s.data.expiry_date) await update(member.id, (m) => void (m.expiry = s.data.expiry_date));
        }
        return json({ ok: true, card: cardView(c?.ok ? c.data : undefined, (await record(member.id)) ?? mine) });
      } finally {
        inflight.delete(member.id);
      }
    }

    case "reveal": {
      if (!rec?.cardId) return json({ ok: false, message: "No card yet." }, 400);
      const s = await cardSecrets(member, rec.cardId);
      if (!s.ok) {
        const c = await cardDetails(member, rec.cardId);
        const view = cardView(c.ok ? c.data : undefined, rec);
        return json({ ok: false, message: view?.pending ? "Your card is still being approved: the details unlock the moment it's active." : s.message, card: view });
      }
      if (s.data.expiry_date && rec.expiry !== s.data.expiry_date) await update(member.id, (m) => void (m.expiry = s.data.expiry_date));
      // Straight to the member, never stored or logged.
      return json({ ok: true, data: { number: (s.data.card_number ?? "").replace(/\s+/g, ""), cvv: s.data.cvv, expiry: toYm(s.data.expiry_date), name: s.data.name_on_card ?? rec.cardName } });
    }

    case "freeze":
    case "unfreeze": {
      if (!rec?.cardId) return json({ ok: false, message: "No card yet." }, 400);
      const r = await freezeCard(member, rec.cardId, b.action === "freeze");
      const c = await cardDetails(member, rec.cardId);
      return json({ ok: r.ok || !!r.pending, message: r.ok ? undefined : r.message, card: cardView(c.ok ? c.data : undefined, rec) });
    }

    case "activity": {
      if (rec?.requestedAt && !rec.cardId) {
        const f = await fulfilWaiting(member);
        const w = await record(member.id);
        if (f === "issued" && w?.cardId) {
          const c = await cardDetails(member, w.cardId);
          return json({ ok: true, activity: [], otp: null, card: cardView(c.ok ? c.data : undefined, w), notices: w.notices ?? [], issued: true });
        }
        return json({ ok: true, activity: [], otp: null, card: WAITING_CARD, notices: rec.notices ?? [] });
      }
      if (!rec?.cardId) return json({ ok: true, activity: [] });
      const s = await syncCard(member);
      const fresh = await record(member.id);
      // The freshest code still valid (the wallet sheet shows it even if Telegram already got it).
      const freshCode = s.rows.map((r) => ({ code: otpOf(r), at: Date.parse(r.date ?? "") })).find((x) => x.code && (!x.at || Date.now() - x.at < 15 * 60_000))?.code;
      return json({
        ok: true,
        activity: s.failed ? null : activityRows(s.rows), // null = couldn't read; the page keeps what it shows
        available: s.card && typeof s.card.balance_usd === "number" ? s.card.balance_usd : null,
        balanceSource: s.card?.balance_source ?? null,
        balanceAsOf: s.card?.balance_as_of ?? null,
        otp: s.otp ?? freshCode ?? null,
        card: cardView(s.card, fresh),
        notices: fresh?.notices ?? [],
      });
    }

    case "set-wallet": {
      const w = b.wallet === "apple" || b.wallet === "google" ? b.wallet : null;
      if (!w || !rec?.cardId) return json({ ok: false, message: "No card yet." }, 400);
      const at = Date.now();
      const label = w === "apple" ? "Apple Pay" : "Google Pay";
      await update(member.id, (m) => {
        m.wallet = w;
        m.walletAt = at;
        m.notices = [{ id: `wallet-${at}`, at, kind: "card" as const, title: `Added to ${label}`, body: "Tap to pay anywhere Visa is accepted." }, ...(m.notices ?? [])].slice(0, 50);
      });
      void notifyMember(member.id, `📱 Your ${CARD} is in <b>${label}</b>. Tap to pay anywhere Visa is accepted; every payment shows up in the app.`);
      return json({ ok: true, wallet: w });
    }

    case "close": {
      // What's left goes back to XLM TREASURY (it loaded the card), not to the member.
      if (!rec?.cardId) return json({ ok: false, message: "No card yet." }, 400);
      const left = await cardDetails(member, rec.cardId);
      const r = await closeCard(member, rec.cardId, "closed by member");
      if (!r.ok && !r.pending) return json({ ok: false, message: r.message });
      const at = Date.now();
      const remaining = left.ok && typeof left.data.balance_usd === "number" ? left.data.balance_usd : 0;
      await update(member.id, (m) => {
        for (const k of ["cardId", "last4", "expiry", "wallet", "walletAt", "seenTx", "seenOtp", "seenKeys", "lowBalanceAlertAt", "requestedAt", "lastBalance"] as const) delete m[k];
        m.notices = [{ id: `closed-${at}`, at, kind: "card" as const, title: "Card closed", body: `${usd(remaining)} returned to XLM TREASURY.` }, ...(m.notices ?? [])].slice(0, 50);
      });
      void notifyMember(member.id, `🗑 Your ${CARD} ··${rec.last4 ?? ""} is closed. The ${usd(remaining)} that was left returned to XLM TREASURY.`);
      return json({ ok: true, remaining });
    }

    case "receipt": {
      if (!rec?.cardId || !b.id) return json({ ok: false, message: "No card yet." }, 400);
      const m = activityRows((await syncCard(member)).rows).find((x) => x.id === b.id);
      if (!m) return json({ ok: false, message: "Movement not found." }, 404);
      const sent = await notifyMember(
        member.id,
        `🧾 <b>Receipt</b>\n${m.merchant}\n${m.group === "Purchase" ? "−" : "+"}${usd(m.amount, m.currency)} · ${m.status}\n${new Date(m.at).toUTCString()}\n${CARD} ··${rec.last4 ?? ""}`,
        { inApp: false },
      );
      return json({ ok: sent, message: sent ? undefined : "Open the app from @XLMTreasuryBot once to receive receipts on Telegram." });
    }

    default:
      return json({ error: "unknown action" }, 400);
  }
}
