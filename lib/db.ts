// Data layer. Postgres (Neon) when POSTGRES_URL is set, else a local JSON file (.data/db.json).
// Every write happens inside tx(): rows are locked (Postgres) or the store is serialized (JSON),
// writes are version-stamped (put() fails if the row changed since it was read) and the whole
// transaction retries on a version conflict. Unique keys (email, tag, verified wallet...) are
// claimed in the same transaction, so two accounts can never take the same one.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Currency } from "./fx.ts";

export type CardId = "silver" | "violet" | "chrome" | "obsidian";

type Base = { id: string; v?: number };

export type User = Base & {
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  name: string;
  tag: string;
  avatar: string | null; // small JPEG data URL
  role: "member" | "admin";
  referralCode: string;
  referredBy: string | null;
  devices: string[]; // device ids seen at signup/login (same-device referral check)
  sessionEpoch: number; // bump to sign out everywhere
  failedLogins: number;
  lockedUntil: number | null;
  prefs: { hideBalances: boolean; emailNotifs: boolean; tgNotifs: boolean };
  timeZone: string | null;
  streak: { count: number; lastDay: string | null; lastAt: number | null };
  maxTier: number; // highest tier ever reached (keeps unlocked card designs)
  lastHolding: { amount: number; xlm?: number; at: number } | null; // last good Stellar read, shown when Horizon is busy
  qualifiedReferrals: number;
  telegramId?: string | null; // linked Telegram account (Mini App sign-in, bot messages)
  telegramUsername?: string | null;
  createdAt: number;
};

export type Wallet = Base & {
  userId: string;
  address: string;
  primary: boolean;
  status: "pending" | "verified";
  memo: string; // proof-payment memo
  memoAt: number; // when the memo was issued (PROOF_WINDOW in lib/stellar.ts)
  oldMemos?: { memo: string; at: number }[]; // earlier codes for this wallet; a payment with one still counts
  proofTx: string | null;
  createdAt: number;
  verifiedAt: number | null;
  /** token code → when this wallet first held it ({ exact: false } = fell back to verifiedAt). */
  heldSince?: Record<string, { at: number; exact: boolean }>;
};

export type Code = Base & {
  userId: string;
  kind: "verify-email" | "reset-password" | "change-email";
  hash: string;
  expiresAt: number;
  attempts: number;
  newEmail?: string;
};

/** id = invitee user id, so a friend can be referred once, ever. */
export type Referral = Base & {
  referrerId: string;
  status: "pending" | "qualified" | "rejected";
  reason?: string;
  ordinal?: number; // 1st, 2nd... qualified referral of this referrer
  amount?: number;
  createdAt: number;
  qualifiedAt?: number;
};

/** id is the idempotency key (e.g. "ref:<inviteeId>"): one payout per reward, ever. */
export type Payout = Base & {
  userId: string;
  kind: "referral";
  amount: number;
  status: "queued" | "sending" | "sent";
  memo: string;
  sendingUntil?: number; // the in-flight transaction cannot land after this time
  destination?: string;
  txHash?: string;
  error?: string;
  createdAt: number;
  sentAt?: number;
};

// ---------- in-app money (see lib/treasury.ts) ----------

/** Where in-app money sits: the member's main account or one of their cards. */
export type Pocket = "main" | `card:${string}`;

export type TreasuryCard = {
  id: string;
  name: string;
  design: CardId;
  currency: Currency; // fixed at creation
  balance: string; // units (1e-7)
  status: "active" | "frozen" | "closed";
  frozenUntil: number | null; // can't unfreeze before this
  createdAt: number;
  closedAt: number | null;
};

/** Running reward accrual for one source, in XLMTREASURY2 units. */
export type Accrual = { accrued: string; accruedAt: number | null; collected: string };

/** A card-only reward waiting for the member's first active card. */
export type PendingCredit = { claimId: string; amount: string; currency: Currency; source: string; memo: string; at: number };

/** One per member (id = user id). In-app balances only: not on-chain, not a bank account. */
export type Treasury = Base & {
  main: { currency: "XLM"; balance: string };
  cards: Record<string, TreasuryCard>;
  defaultDestination: Pocket;
  accruals: Record<string, Accrual>;
  pending: PendingCredit[];
};

/**
 * One row per money movement. id = the idempotency key / claim id, so the same request or
 * claim can never be applied twice. from/to: "main" | "card:<id>" | "reward:<source>" | "p2p:<user id>".
 */
export type Movement = Base & {
  at: number;
  accountId: string; // whose movement it is (the sender for p2p)
  counterpartyId: string | null; // the receiving member for p2p
  from: string;
  to: string;
  sent: { amount: string; currency: Currency } | null; // what left `from` (null for credits from outside)
  amount: string; // as received by `to`
  currency: Currency;
  xlmValue: string;
  fxRate: number; // received per sent
  source: string; // "transfer" | "p2p" | "card-close" | "admin" | reward source…
  memo: string;
};

export type Notification = Base & { userId: string; at: number; text: string; read: boolean };

/** Small system rows (e.g. "payout-runner": the lease that keeps payout runs one at a time). */
export type Meta = Base & { until?: number; lastRun?: number };

export type Tables = {
  meta: Meta;
  users: User;
  wallets: Wallet;
  codes: Code;
  referrals: Referral;
  payouts: Payout;
  treasury: Treasury;
  movements: Movement;
  notifications: Notification;
};
type T = keyof Tables;

const UNIQUE: { [K in T]?: (r: Tables[K]) => string[] } = {
  users: (u) => [`email:${u.email.toLowerCase()}`, `tag:${u.tag.toLowerCase()}`, `ref:${u.referralCode}`, ...(u.telegramId ? [`tg:${u.telegramId}`] : [])],
  wallets: (w) => [`wallet:${w.userId}:${w.address}`, ...(w.status === "verified" ? [`verified:${w.address}`] : [])],
};
const keysOf = <K extends T>(t: K, r: Tables[K] | null) => (r ? (UNIQUE[t] as ((r: Tables[K]) => string[]) | undefined)?.(r) ?? [] : []);

/** A unique key is already taken by another row (e.g. "email:a@b.c"). Not retried. */
export class Conflict extends Error {
  key: string;
  constructor(key: string) {
    super(`Already taken: ${key.split(":")[0]}`);
    this.key = key;
  }
}
class VersionConflict extends Error {}

export interface Tx {
  /** Read a row; in Postgres the row stays locked until the transaction ends. */
  get<K extends T>(t: K, id: string): Promise<Tables[K] | null>;
  find<K extends T>(t: K, field: keyof Tables[K] & string, value: string | number | boolean): Promise<Tables[K][]>;
  insert<K extends T>(t: K, row: Tables[K]): Promise<Tables[K]>;
  /** Write back a row read in this transaction. Fails (and the tx retries) if it changed meanwhile. */
  put<K extends T>(t: K, row: Tables[K]): Promise<Tables[K]>;
  del<K extends T>(t: K, id: string): Promise<void>;
}

type Driver = { run<R>(fn: (tx: Tx) => Promise<R>): Promise<R> };

// ---------- JSON file (development) ----------

type Snapshot = { docs: { [t: string]: { [id: string]: Base } }; uniq: { [key: string]: string } };

function jsonDriver(fileOf: () => string): Driver {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (file: string): Promise<Snapshot> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { docs: {}, uniq: {} };
      throw e;
    }
  };

  return {
    run<R>(fn: (tx: Tx) => Promise<R>) {
      // ponytail: one global queue per process; the JSON store is for local development only.
      const job = queue.then(async () => {
        const file = fileOf();
        const s = await read(file);
        const table = (t: string) => (s.docs[t] ??= {});
        const claim = (keys: string[], owner: string, old: string[] = []) => {
          for (const k of keys) if (s.uniq[k] && s.uniq[k] !== owner) throw new Conflict(k);
          for (const k of old) if (!keys.includes(k)) delete s.uniq[k];
          for (const k of keys) s.uniq[k] = owner;
        };
        const tx: Tx = {
          async get(t, id) {
            const r = table(t)[id];
            return r ? structuredClone(r as never) : null;
          },
          async find(t, field, value) {
            return Object.values(table(t))
              .filter((r) => (r as Record<string, unknown>)[field] === value)
              .map((r) => structuredClone(r as never));
          },
          async insert(t, row) {
            if (table(t)[row.id]) throw new Conflict(`${t}:${row.id}`);
            claim(keysOf(t, row), `${t}/${row.id}`);
            const saved = { ...row, v: 1 };
            table(t)[row.id] = saved;
            return structuredClone(saved);
          },
          async put(t, row) {
            const cur = table(t)[row.id] as Tables[typeof t] | undefined;
            if (!cur || cur.v !== row.v) throw new VersionConflict();
            claim(keysOf(t, row), `${t}/${row.id}`, keysOf(t, cur));
            const saved = { ...row, v: (row.v ?? 0) + 1 };
            table(t)[row.id] = saved;
            return structuredClone(saved);
          },
          async del(t, id) {
            const cur = table(t)[id] as Tables[typeof t] | undefined;
            for (const k of keysOf(t, cur ?? null)) delete s.uniq[k];
            delete table(t)[id];
          },
        };
        const result = await fn(tx);
        await fs.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(s));
        await fs.rename(tmp, file); // atomic replace
        return result;
      });
      queue = job.catch(() => {});
      return job;
    },
  };
}

// ---------- Postgres ----------

export type Query = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
export type WithTx = <R>(fn: (q: Query) => Promise<R>) => Promise<R>;

export const SCHEMA = `
create table if not exists docs (tbl text not null, id text not null, v int not null, data jsonb not null, primary key (tbl, id));
create table if not exists uniq (key text primary key, tbl text not null, id text not null);
`;

export function sqlDriver(withTx: WithTx): Driver {
  const row = <R>(r: Record<string, unknown>) => ({ ...(r.data as object), v: r.v }) as R;
  return {
    run: (fn) =>
      withTx(async (q) => {
        const claim = async (t: string, id: string, keys: string[], old: string[] = []) => {
          const gone = old.filter((k) => !keys.includes(k));
          if (gone.length) await q("delete from uniq where key = any($1) and tbl = $2 and id = $3", [gone, t, id]);
          for (const k of keys) {
            const r = await q("insert into uniq (key, tbl, id) values ($1, $2, $3) on conflict (key) do nothing", [k, t, id]);
            if (r.rowCount === 0) {
              const owner = await q("select tbl, id from uniq where key = $1", [k]);
              if (owner.rows[0]?.tbl !== t || owner.rows[0]?.id !== id) throw new Conflict(k);
            }
          }
        };
        const tx: Tx = {
          async get(t, id) {
            const r = await q("select v, data from docs where tbl = $1 and id = $2 for update", [t, id]);
            return r.rows[0] ? row(r.rows[0]) : null;
          },
          async find(t, field, value) {
            const r = await q("select v, data from docs where tbl = $1 and data->>$2 = $3", [t, field, String(value)]);
            return r.rows.map((x) => row(x));
          },
          async insert(t, r) {
            const ins = await q("insert into docs (tbl, id, v, data) values ($1, $2, 1, $3) on conflict do nothing", [t, r.id, JSON.stringify({ ...r, v: undefined })]);
            if (ins.rowCount === 0) throw new Conflict(`${t}:${r.id}`);
            await claim(t, r.id, keysOf(t, r));
            return { ...r, v: 1 };
          },
          async put(t, r) {
            const cur = await tx.get(t, r.id);
            if (!cur || cur.v !== r.v) throw new VersionConflict();
            await claim(t, r.id, keysOf(t, r), keysOf(t, cur));
            const up = await q("update docs set v = v + 1, data = $4 where tbl = $1 and id = $2 and v = $3", [t, r.id, r.v, JSON.stringify({ ...r, v: undefined })]);
            if (up.rowCount === 0) throw new VersionConflict();
            return { ...r, v: (r.v ?? 0) + 1 };
          },
          async del(t, id) {
            await q("delete from uniq where tbl = $1 and id = $2", [t, id]);
            await q("delete from docs where tbl = $1 and id = $2", [t, id]);
          },
        };
        return fn(tx);
      }),
  };
}

async function neonDriver(url: string): Promise<Driver> {
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString: url });
  await pool.query(SCHEMA);
  return sqlDriver(async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const r = await fn((text, params) => client.query(text, params) as never);
      await client.query("commit");
      return r;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });
}

// ---------- entry points ----------

const RETRYABLE = new Set(["40001", "40P01"]); // serialization failure, deadlock

export function makeDb(driver: Driver | Promise<Driver>) {
  async function tx<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    const d = await driver;
    for (let attempt = 1; ; attempt++) {
      try {
        return await d.run(fn);
      } catch (e) {
        const retry = e instanceof VersionConflict || RETRYABLE.has((e as { code?: string }).code ?? "");
        if (!retry || attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
      }
    }
  }
  return {
    tx,
    get: <K extends T>(t: K, id: string) => tx((x) => x.get(t, id)),
    find: <K extends T>(t: K, field: keyof Tables[K] & string, value: string | number | boolean) => tx((x) => x.find(t, field, value)),
  };
}

const g = globalThis as unknown as { __db?: ReturnType<typeof makeDb> };
export const db = (g.__db ??= makeDb(
  process.env.POSTGRES_URL ? neonDriver(process.env.POSTGRES_URL) : jsonDriver(() => process.env.DB_FILE ?? path.join(process.cwd(), ".data", "db.json")),
));
