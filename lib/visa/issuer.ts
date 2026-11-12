import "server-only";
import { randomBytes } from "node:crypto";
import { db, type CardCustomer, type Meta } from "../db";
import { classifyWl, isUsableCard, type WlResult, type WlTransaction } from "./pure";

/**
 * StellarPay Visa: the card issuer's white-label API (ported from NEWBANK). Server only.
 *
 * Every member becomes a customer at the issuer that we create and act as server-side with a random
 * password they never see. The owner loads members BY HAND at the issuer (owner, 2026-11-12); a card is
 * bought through the API from that balance and then holds its own; the app reads everything back.
 * Card numbers are fetched live per reveal and never stored or logged.
 *
 * Money rule: 202 / pending:true means money moved and the outcome is unconfirmed: NEVER retry it.
 */

const BASE = "https://appapi.kripicard.com/api/v1";
export const SANDBOX_BIN = "539502";
const WL_BIN = process.env.CARD_WL_BIN || "";

/**
 * Which environment we talk to, and with which key. Live needs ALL of: KRIPICARD_ENV=live (the owner's
 * on-switch), a pk_live_ key, and the production database: so the live key in a local .env can never
 * create a real customer or card from a developer machine.
 */
export function wlMode(): { mode: "sandbox" | "live"; key: string | null; problem?: string } {
  const live = (process.env.KRIPICARD_ENV || "").trim().toLowerCase() === "live";
  const mode = live ? "live" : "sandbox";
  const key = ((live ? (process.env.KRIPICARD_API ?? process.env.KRIPICARD_LIVE) : process.env.KRIPI_API) || "").trim() || null;
  if (!key) {
    const hasLive = (process.env.KRIPICARD_API ?? "").startsWith("pk_live_");
    return { mode, key: null, problem: live ? "KRIPICARD_API is not set." : hasLive ? "StellarPay Visa is off: set KRIPICARD_ENV=live to switch it on." : "Card issuing isn't configured." };
  }
  const want = live ? "pk_live_" : "pk_test_";
  if (!key.startsWith(want)) return { mode, key: null, problem: `Mode is ${mode} but the key doesn't start with ${want}.` };
  if (live && !process.env.POSTGRES_URL) return { mode, key: null, problem: "Live cards only run on the production database." };
  return { mode, key };
}

const tokenCache = new Map<string, { token: string; exp: number }>();

async function wl<T = Record<string, unknown>>(method: string, path: string, opts: { token?: string; body?: Record<string, unknown>; idem?: string } = {}): Promise<WlResult<T>> {
  const m = wlMode();
  if (!m.key) return { ok: false, status: 0, message: m.problem ?? "Card issuing isn't configured.", data: {} as T };
  const headers: Record<string, string> = { "X-Publishable-Key": m.key };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.idem) headers["Idempotency-Key"] = opts.idem;
  let res: Response;
  try {
    // A hung issuer call held a whole cron pass on NEWBANK: reads give up at 12 s, writes at 25 s.
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(method === "GET" ? 12_000 : 25_000),
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach the card network. Please try again.", data: {} as T };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && opts.token) {
    // Token rejected: forget it everywhere so the next call signs in fresh.
    for (const [k, v] of tokenCache) if (v.token === opts.token) tokenCache.delete(k);
    for (const r of await db.find("cardCustomers", "token", opts.token))
      await update(r.id, (x) => {
        if (x.token !== opts.token) return false;
        delete x.token;
        delete x.tokenExp;
      });
  }
  return classifyWl<T>(res.status, json);
}

// ---------- records (one row per member; a record from the other environment is invisible) ----------

export type Member = { id: string; tag: string; email: string; name: string };

export async function record(userId: string): Promise<CardCustomer | undefined> {
  const r = await db.get("cardCustomers", userId);
  return r && r.env === wlMode().mode ? r : undefined;
}

/**
 * Read-check-write under the row lock. `fn` edits the row in place; returning false aborts the write.
 * Returns whether it wrote. This is what makes the claims (issuingAt, refreshingAt) safe.
 */
export async function update(userId: string, fn: (m: CardCustomer) => boolean | void): Promise<boolean> {
  return db.tx(async (t) => {
    const m = await t.get("cardCustomers", userId);
    if (!m || m.env !== wlMode().mode) return false;
    if (fn(m) === false) return false;
    await t.put("cardCustomers", m);
    return true;
  });
}

/** The shared "card-ops" row: issuer sign-in pause, card health, cron progress. */
export const ops = async (): Promise<Meta> => (await db.get("meta", "card-ops")) ?? { id: "card-ops" };
export async function setOps(fn: (o: Meta) => void) {
  await db.tx(async (t) => {
    const o = await t.get("meta", "card-ops");
    const next = o ?? { id: "card-ops" };
    fn(next);
    await (o ? t.put("meta", next) : t.insert("meta", next));
  });
}

// ---------- customer creation (crash-safe) ----------

const rand = () => "Xt!" + randomBytes(9).toString("base64url") + randomBytes(3).toString("hex").toUpperCase();
/** name@gmail.com → name+xlmtreasury@gmail.com: same inbox at every major provider, a distinct customer at the issuer. */
const aliasOf = (email: string, tag: string) => email.replace(/^([^@+]+)(\+[^@]*)?@/, `$1+${tag}@`);

/** Customer id behind saved credentials: null = they don't open an account; "later" = couldn't tell. */
async function customerIdFor(email: string, password: string): Promise<number | null | "later"> {
  if (((await ops()).loginPauseUntil ?? 0) > Date.now()) return "later";
  const r = await wl<{ access_token?: string }>("POST", "/auth/login", { body: { email, password } });
  if (r.status === 429) await setOps((o) => void (o.loginPauseUntil = Math.max(o.loginPauseUntil ?? 0, Date.now() + 10 * 60_000)));
  if (r.status === 429 || r.status === 0 || r.status >= 500) return "later";
  const token = (r.data as { access_token?: string }).access_token;
  if (!r.ok || !token) return null;
  const me = await wl<{ customer?: { id?: number }; id?: number }>("GET", "/me", { token });
  const d = me.data as { customer?: { id?: number }; id?: number };
  return d.customer?.id ?? d.id ?? null;
}

/**
 * The member's issuer customer, created if needed. Credentials are SAVED before each register call
 * (customerId 0 = "registration sent"), so a lost reply is recovered by logging in instead of leaving
 * an email "taken" by an account nobody can open. Separate partner account from NEWBANK (owner), so the
 * member's own email is tried first, then plus-aliases.
 */
export async function ensureCustomer(member: Member, mobile?: string): Promise<CardCustomer | { error: string }> {
  const mode = wlMode().mode;
  const existing = await record(member.id);
  if (existing && existing.customerId > 0) return existing;

  const save = (fields: { email: string; password: string; customerId: number }) =>
    db.tx(async (t) => {
      const m = await t.get("cardCustomers", member.id);
      const mine = m && m.env === mode ? m : null;
      if (mine && mine.customerId > 0) return; // someone finished first
      const row: CardCustomer = { ...(mine ?? {}), id: member.id, env: mode, createdAt: mine?.createdAt ?? Date.now(), ...(mobile ? { mobile } : {}), ...fields, v: m?.v } as CardCustomer;
      await (m ? t.put("cardCustomers", row) : t.insert("cardCustomers", row));
    });

  if (existing && existing.customerId === 0) {
    const id = await customerIdFor(existing.email, existing.password);
    // Can't tell whether it went through: a second customer for the same member would split their money.
    if (id === "later") return { error: "Couldn't reach your card account right now. Please try again in a minute." };
    if (id) {
      await save({ email: existing.email, password: existing.password, customerId: id });
      return (await record(member.id)) ?? { error: "Please try again." };
    }
  }

  const base = member.email;
  const tried = existing?.customerId === 0 ? existing.email : null;
  const candidates = [base, aliasOf(base, "xlmtreasury"), aliasOf(base, "xlmtreasury2"), aliasOf(base, "xlmtreasury3")].filter((e) => e !== tried);
  const taken = (msg: string) => /taken|exists|already/i.test(msg);
  for (const email of candidates) {
    const password = rand();
    await save({ email, password, customerId: 0 });
    const r = await wl<{ customer?: { id: number } }>("POST", "/auth/register", {
      body: { email, password, profile: { app_member_id: member.id, name: member.name, ...(mobile ? { mobile } : {}) } },
    });
    const customerId = (r.data as { customer?: { id: number } })?.customer?.id;
    if (r.ok && customerId) {
      await save({ email, password, customerId });
      return (await record(member.id)) ?? { error: "Please try again." };
    }
    if (!taken(r.message)) return { error: r.message };
  }
  console.error(`[visa] no free email for @${member.tag}`);
  return { error: "We couldn't set up your card account with this email. Please contact support." };
}

// ---------- sessions: memory → stored → refresh (one process) → password (rationed) ----------

const refreshing = new Map<string, Promise<string | null>>();
const REFRESH_CLAIM_MS = 20_000;

async function accessToken(rec: CardCustomer): Promise<string | null> {
  const now = Date.now();
  const cached = tokenCache.get(rec.email);
  if (cached && cached.exp > now + 30_000) return cached.token;
  const stored = await record(rec.id);
  if (stored?.token && (stored.tokenExp ?? 0) > now + 30_000) {
    tokenCache.set(rec.email, { token: stored.token, exp: stored.tokenExp! });
    return stored.token;
  }
  if (stored?.refreshToken) {
    let p = refreshing.get(rec.id);
    if (!p) {
      p = refreshSession(rec).finally(() => refreshing.delete(rec.id));
      refreshing.set(rec.id, p);
    }
    const t = await p;
    if (t) return t;
  }
  return passwordLogin(rec);
}

type Pair = { access_token?: string; refresh_token?: string; expires_in?: number };

async function saveSession(rec: CardCustomer, data: Pair) {
  const token = data.access_token!;
  const exp = Date.now() + (data.expires_in ?? 900) * 1000;
  tokenCache.set(rec.email, { token, exp });
  await update(rec.id, (m) => {
    m.token = token;
    m.tokenExp = exp;
    if (data.refresh_token) m.refreshToken = data.refresh_token;
    delete m.refreshingAt;
    delete m.loginError;
    delete m.loginErrorAt;
    delete m.loginRetryAt;
  });
  return token;
}

/** Refresh tokens rotate and are single-use: exactly one process may spend one (claimed under the lock). */
async function refreshSession(rec: CardCustomer): Promise<string | null> {
  let claim: { rt: string } | "busy" | null = null;
  await update(rec.id, (m) => {
    if (!m.refreshToken || (m.token && (m.tokenExp ?? 0) > Date.now() + 30_000)) return false;
    if (m.refreshingAt && Date.now() - m.refreshingAt < REFRESH_CLAIM_MS) {
      claim = "busy";
      return false;
    }
    m.refreshingAt = Date.now();
    claim = { rt: m.refreshToken };
  });
  const got = claim as { rt: string } | "busy" | null;
  if (got === "busy" || got === null) {
    for (let i = 0; i < 8; i++) {
      const m = await record(rec.id);
      if (m?.token && (m.tokenExp ?? 0) > Date.now() + 30_000) {
        tokenCache.set(rec.email, { token: m.token, exp: m.tokenExp! });
        return m.token;
      }
      if (got === null && !m?.refreshToken) return null;
      await new Promise((r) => setTimeout(r, 750));
    }
    return null;
  }
  const r = await wl<Pair>("POST", "/auth/refresh", { body: { refresh_token: got.rt } });
  const data = r.data as Pair;
  if (r.ok && data.access_token) return saveSession(rec, data);
  console.error(`[visa] refresh refused for customer #${rec.customerId}: ${r.status}`);
  await update(rec.id, (m) => {
    delete m.refreshingAt;
    if (r.status !== 0 && m.refreshToken === got.rt) delete m.refreshToken; // dead; a network error keeps it
  });
  return null;
}

/** Last resort. The issuer's sign-in limit is shared by ALL our customers and every refusal extends it. */
async function passwordLogin(rec: CardCustomer): Promise<string | null> {
  const now = Date.now();
  const stored = await record(rec.id);
  if (stored?.loginRetryAt && now < stored.loginRetryAt) return null;
  if (((await ops()).loginPauseUntil ?? 0) > now) return null;
  const r = await wl<Pair>("POST", "/auth/login", { body: { email: rec.email, password: rec.password } });
  const data = r.data as Pair;
  if (!r.ok || !data.access_token) {
    console.error(`[visa] login refused for customer #${rec.customerId}: ${r.status}`);
    await update(rec.id, (m) => {
      m.loginError = `${r.status}: ${r.message}`;
      m.loginErrorAt = now;
      m.loginRetryAt = now + (r.status === 429 ? 15 * 60_000 : 60_000);
    });
    if (r.status === 429) await setOps((o) => void (o.loginPauseUntil = Math.max(o.loginPauseUntil ?? 0, now + 10 * 60_000)));
    return null;
  }
  return saveSession(rec, data);
}

async function tokenFor(member: Member, mobile?: string): Promise<{ rec: CardCustomer; token: string } | { error: string }> {
  const rec = await ensureCustomer(member, mobile);
  if ("error" in rec) return rec;
  const token = await accessToken(rec);
  if (!token) return { error: "Couldn't reach your card account right now. Please try again in a minute." };
  return { rec, token };
}

/** Same as tokenFor but never registers (GET paths, cron). */
async function existingToken(member: Member): Promise<{ rec: CardCustomer; token: string } | { error: string }> {
  const rec = await record(member.id);
  if (!rec || rec.customerId === 0) return { error: "No card account yet." };
  const token = await accessToken(rec);
  return token ? { rec, token } : { error: "Couldn't reach your card account right now. Please try again in a minute." };
}

const fail = (message: string): WlResult => ({ ok: false, status: 400, message, data: {} });
/**
 * The array inside an issuer reply, whatever its wrapping: the reply itself, one of `keys`, a common
 * container ("items", "data", "rows", "records", "results"), or one level deeper (e.g. data.data.transactions).
 * A shape we don't recognise must not read as "nothing there" silently, so it logs the keys it saw.
 */
function list<T>(d: unknown, ...keys: string[]): T[] {
  const names = [...keys, "items", "data", "rows", "records", "results"];
  const find = (v: unknown, depth: number): T[] | null => {
    if (Array.isArray(v)) return v as T[];
    if (!v || typeof v !== "object" || depth > 2) return null;
    for (const k of names) {
      const hit = find((v as Record<string, unknown>)[k], depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  const got = find(d, 0);
  if (!got && d && typeof d === "object" && Object.keys(d).length) console.error(`[visa] unrecognised list reply, keys: ${Object.keys(d).join(",")}`);
  return got ?? [];
}

// ---------- operations ----------

export async function memberBalance(member: Member): Promise<WlResult<{ balance?: number; currency?: string }>> {
  const t = await existingToken(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: {} };
  return wl("GET", "/me/balance", { token: t.token });
}

export interface DepositInvoice {
  id?: number;
  status?: string;
  pay_address?: string | null;
  pay_amount?: number | null;
  memo?: string | null;
  extra_id?: string | null;
  expires_at?: string | null;
}

export async function listCurrencies(member: Member): Promise<WlResult<{ symbol: string; network?: string; min_amount?: number }[]>> {
  const t = await existingToken(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: [] };
  const r = await wl("GET", "/deposits/currencies", { token: t.token });
  return { ...r, data: list(r.data, "currencies", "items") };
}

/** Sandbox: create a deposit and self-confirm it (fake money). Live: just the invoice, for the owner to pay by hand. */
export async function fundMember(member: Member, usd: number): Promise<WlResult<{ deposit?: DepositInvoice }>> {
  const t = await tokenFor(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: {} };
  const dep = await wl<{ deposit?: DepositInvoice }>("POST", "/deposits", { token: t.token, body: { amount: usd, coin: "XLM" }, idem: `dep-${member.id}-${Date.now()}` });
  const id = dep.data.deposit?.id;
  if (!dep.ok || !id || wlMode().mode === "live") return dep;
  return wl("POST", `/deposits/${id}/confirm`, { token: t.token });
}

export interface WlBin {
  id: string;
  name?: string;
  maintenance?: boolean;
  issuance_fee_usd?: number;
  requires_date_of_birth?: boolean;
  platforms?: string[];
}

export async function listBins(member: Member): Promise<WlResult<WlBin[]>> {
  const t = await existingToken(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: [] };
  const r = await wl("GET", "/cards/bins", { token: t.token });
  return { ...r, data: list(r.data, "items", "bins") };
}

let binCache: { id: string; at: number } | null = null;

/** Env pin, else sandbox's BIN, else the cheapest live BIN not in maintenance, without DOB, with Apple/Google Pay. */
export async function resolveBin(member: Member): Promise<{ bin: string; source: string } | { error: string }> {
  if (WL_BIN) return { bin: WL_BIN, source: "env" };
  if (wlMode().mode === "sandbox") return { bin: SANDBOX_BIN, source: "sandbox" };
  if (binCache && Date.now() - binCache.at < 3_600_000) return { bin: binCache.id, source: "catalog (cached)" };
  const r = await listBins(member);
  if (!r.ok) return { error: `Couldn't read the BIN catalog: ${r.message}` };
  const wallet = (b: WlBin) => (b.platforms ?? []).some((p) => /apple_pay|google_pay/.test(p));
  const open = r.data.filter((b) => b.id && !b.maintenance && !b.requires_date_of_birth);
  const usable = open.filter(wallet).length ? open.filter(wallet) : open;
  const pick = [...(usable.length ? usable : r.data)].sort((a, b) => (a.issuance_fee_usd ?? 1e9) - (b.issuance_fee_usd ?? 1e9))[0];
  if (!pick?.id) return { error: "The live BIN catalog is empty: ask the issuer which BIN the program uses." };
  binCache = { id: pick.id, at: Date.now() };
  return { bin: pick.id, source: `catalog: ${pick.name ?? pick.id}` };
}

export interface WlCard {
  id: number;
  last4?: string | null;
  status?: string;
  balance_usd?: number | null;
  /** confirmed | pending_confirmation (recent activity still settling: show "updating") | unknown (balance_usd null, never 0) */
  balance_source?: string;
  balance_as_of?: string | null;
  live_details_available?: boolean;
}

export async function listCards(member: Member): Promise<WlResult<WlCard[]>> {
  const t = await existingToken(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: [] };
  const r = await wl("GET", "/cards", { token: t.token });
  return { ...r, data: list(r.data, "cards") };
}

export async function issueCard(member: Member, amount: number): Promise<WlResult> {
  const t = await existingToken(member);
  if ("error" in t) return fail(t.error);
  const b = await resolveBin(member);
  if ("error" in b) return fail(b.error);
  const r = await wl("POST", "/cards", { token: t.token, body: { bin: b.bin, amount, card_name: t.rec.cardName ?? member.name }, idem: `card-${member.id}-${Date.now()}` });
  if (r.ok || r.pending) {
    const cards = await listCards(member);
    const card = cards.data.find(isUsableCard);
    if (card) await update(member.id, (m) => void ((m.cardId = card.id), (m.last4 = card.last4 ?? m.last4)));
  }
  return r;
}

export async function cardDetails(member: Member, cardId: number): Promise<WlResult<WlCard>> {
  const t = await existingToken(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: { id: cardId } };
  const r = await wl<{ card?: WlCard } & WlCard>("GET", `/cards/${cardId}`, { token: t.token });
  // live_details_available sits beside "card", not inside it
  return { ...r, data: { ...((r.data.card ?? r.data) as WlCard), live_details_available: r.data.live_details_available } };
}

export interface WlSecrets {
  card_number?: string;
  cvv?: string;
  expiry_date?: string; // MM/YY
  name_on_card?: string;
}

/** Live wraps them as { card: {...}, livemode }; sandbox is flat. Never stored or logged. */
export async function cardSecrets(member: Member, cardId: number): Promise<WlResult<WlSecrets>> {
  const t = await existingToken(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: {} };
  const r = await wl<WlSecrets & { card?: WlSecrets }>("GET", `/cards/${cardId}/secrets`, { token: t.token });
  return { ...r, data: r.data.card ?? r.data };
}

/** `idem` comes from WHAT is funded, so the issuer dedupes a repeat of the same top-up. */
export async function fundCard(member: Member, cardId: number, usd: number, idem: string): Promise<WlResult> {
  const t = await existingToken(member);
  if ("error" in t) return fail(t.error);
  return wl("POST", `/cards/${cardId}/fund`, { token: t.token, body: { amount: usd }, idem });
}

export async function freezeCard(member: Member, cardId: number, freeze: boolean): Promise<WlResult> {
  const t = await existingToken(member);
  if ("error" in t) return fail(t.error);
  return wl("POST", `/cards/${cardId}/${freeze ? "freeze" : "unfreeze"}`, { token: t.token });
}

/** The remainder goes back to the customer balance (our float), minus any fee. */
export async function closeCard(member: Member, cardId: number, reason: string): Promise<WlResult> {
  const t = await existingToken(member);
  if ("error" in t) return fail(t.error);
  return wl("DELETE", `/cards/${cardId}`, { token: t.token, body: { reason }, idem: `close-${cardId}-${Date.now()}` });
}

/** Admin diagnostics: the card network's replies for this card exactly as sent (no card number or CVV in them). */
export async function rawCardReplies(member: Member, cardId: number) {
  const t = await existingToken(member);
  if ("error" in t) return { error: t.error };
  const [card, transactions] = await Promise.all([wl("GET", `/cards/${cardId}`, { token: t.token }), wl("GET", `/cards/${cardId}/transactions`, { token: t.token })]);
  return { card, transactions };
}

export async function cardTransactions(member: Member, cardId: number): Promise<WlResult<WlTransaction[]>> {
  const t = await existingToken(member);
  if ("error" in t) return { ok: false, status: 400, message: t.error, data: [] };
  const r = await wl("GET", `/cards/${cardId}/transactions`, { token: t.token });
  // Issuer docs: an empty list under live_details_available:false is NOT "never used": treat it as a failed read
  // (keeps the page's rows and the sync markers untouched instead of announcing nothing / replaying later).
  if (r.ok && (r.data as { live_details_available?: boolean }).live_details_available === false)
    return { ok: false, status: r.status, message: "The card network couldn't read the card just now.", data: [] };
  return { ...r, data: list(r.data, "transactions") };
}
