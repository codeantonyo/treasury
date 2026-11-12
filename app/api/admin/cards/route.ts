import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { notifyMember } from "@/lib/notify";
import { currentUser } from "@/lib/session";
import {
  cardSecrets,
  cardTransactions,
  closeCard,
  ensureCustomer,
  freezeCard,
  fundCard,
  fundMember,
  issueCard,
  listBins,
  listCards,
  listCurrencies,
  memberBalance,
  ops,
  record,
  resolveBin,
  update,
  wlMode,
} from "@/lib/visa/issuer";
import { canSeeCard, cardHolders, fulfilWaiting, loadFor, memberOf, syncCard, waitingMembers } from "@/lib/visa/sync";
import { CARD_LOAD_BY_TIER, cardCreditUsd } from "@/lib/visa/pure";

/**
 * /api/admin/cards: the StellarPay Visa operator console. Admins only (session role, or Bearer CRON_SECRET).
 * The owner loads members by hand at the issuer; this shows who needs what and reads everything back.
 * Every action names a member (username, email or id). Card numbers pass through and are never stored or logged.
 */
export const maxDuration = 120;
const MAX_USD = Math.max(...Object.values(CARD_LOAD_BY_TIER)); // per-call ceiling: the top tier's load

async function isAdmin(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (secret && got.length === want.length && timingSafeEqual(got, want)) return true;
  const u = await currentUser();
  return !!u && (u.role === "admin" || canSeeCard(u)); // the owner testing the card may not hold the admin role
}

async function findMember(q: string) {
  const s = q.trim().replace(/^@/, "");
  if (!s) return null;
  const u = (await db.find("users", "tag", s.toLowerCase()))[0] ?? (await db.find("users", "email", s.toLowerCase()))[0] ?? (await db.get("users", s));
  return u ? memberOf(u.id) : null;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);
  let b: { action?: string; member?: string; amount?: number; freeze?: boolean; text?: string };
  try {
    b = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  if (b.action === "mode") {
    const m = wlMode();
    const key = (m.mode === "live" ? process.env.KRIPICARD_API ?? process.env.KRIPICARD_LIVE : process.env.KRIPI_API) ?? "";
    return json({
      mode: m.mode,
      enabled: !!m.key,
      problem: m.problem ?? null,
      key: key ? `${key.slice(0, 12)}…` : null,
      bin: process.env.CARD_WL_BIN || (m.mode === "sandbox" ? "539502 (sandbox)" : "cheapest wallet-capable BIN in the catalog"),
      ladder: CARD_LOAD_BY_TIER,
      ops: await ops(),
    });
  }
  if (b.action === "waiting") {
    const rows = await waitingMembers();
    return json(
      await Promise.all(
        rows.map(async (r) => {
          const m = await memberOf(r.id);
          const load = m ? loadFor(m, r.tier ?? null) : 0;
          return { member: m?.tag, customerId: r.customerId, issuerEmail: r.email, reservedAt: r.requestedAt, tier: r.tier ?? null, cardLoadUsd: load, loadThisUsd: cardCreditUsd(load), issueError: r.issueError ?? null };
        }),
      ),
    );
  }

  if (b.action === "cardholders") {
    // For loading by hand: each card's tier amount next to what's on it (last read).
    const rows = await cardHolders();
    return json(
      await Promise.all(
        rows.map(async (r) => {
          const m = await memberOf(r.id);
          return { member: m?.tag, customerId: r.customerId, last4: r.last4, tier: r.tier ?? null, tierLoadUsd: m ? loadFor(m, r.tier ?? null) : null, onCardUsd: r.lastBalance ?? null, lastLoadAt: r.lastLoadAt ?? null, inWallet: r.wallet ?? null };
        }),
      ),
    );
  }

  const member = await findMember(b.member ?? "");
  if (!member) return json({ error: "member not found" }, 404);
  const rec = await record(member.id);
  const amount = Number(b.amount);
  const capped = () => (amount >= 1 && amount <= MAX_USD ? null : json({ error: `amount must be $1–$${MAX_USD}` }, 400));

  switch (b.action) {
    case "status": {
      if (!rec) return json({ member: member.tag, record: null });
      const { password, token, refreshToken, ...safe } = rec;
      void password;
      return json({ member: member.tag, record: { ...safe, hasToken: !!token, hasRefresh: !!refreshToken } });
    }
    case "ensure":
      return json(await ensureCustomer(member));
    case "balance":
      return json(await memberBalance(member));
    case "bins":
      return json({ bins: await listBins(member), pick: await resolveBin(member) });
    case "currencies":
      return json(await listCurrencies(member));
    case "fund-member":
      return capped() ?? json(await fundMember(member, amount));
    case "issue":
      return capped() ?? json(await issueCard(member, amount));
    case "list":
      return json(await listCards(member));
    case "transactions":
      return rec?.cardId ? json(await cardTransactions(member, rec.cardId)) : json({ error: "no card" }, 400);
    case "sync":
      return json({ sync: await syncCard(member), waiting: rec?.requestedAt && !rec.cardId ? await fulfilWaiting(member) : null });
    case "secrets":
      return rec?.cardId ? json(await cardSecrets(member, rec.cardId)) : json({ error: "no card" }, 400); // diagnostics only, never logged
    case "fund-card": {
      if (!rec?.cardId) return json({ error: "no card" }, 400);
      const bad = capped();
      if (bad) return bad;
      // Moves the member's issuer balance onto the card; the card's own load row announces it.
      return json(await fundCard(member, rec.cardId, amount, `fund-${rec.cardId}-admin-${Date.now()}`));
    }
    case "freeze":
      return rec?.cardId ? json(await freezeCard(member, rec.cardId, b.freeze !== false)) : json({ error: "no card" }, 400);
    case "close-card": {
      if (!rec?.cardId) return json({ error: "no card" }, 400);
      const r = await closeCard(member, rec.cardId, "closed by admin");
      if (r.ok || r.pending)
        await update(member.id, (m) => {
          for (const k of ["cardId", "last4", "expiry", "wallet", "walletAt", "seenTx", "seenOtp", "seenKeys", "lowBalanceAlertAt", "requestedAt", "lastBalance"] as const) delete m[k];
        });
      return json(r);
    }
    case "forget":
      // Drops a dead record (e.g. a customer the issuer deleted). The member can start again.
      await db.tx(async (t) => void ((await t.get("cardCustomers", member.id)) && (await t.del("cardCustomers", member.id))));
      return json({ ok: true });
    case "notify":
      if (!b.text) return json({ error: "text required" }, 400);
      return json({ ok: await notifyMember(member.id, b.text) });
    default:
      return json({ error: "unknown action" }, 400);
  }
}
