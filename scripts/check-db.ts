// Run: node scripts/check-db.ts
// Exercises both storage backends (JSON file + real Postgres via in-process PGlite).
// Never touches POSTGRES_URL.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Conflict, makeDb, SCHEMA, sqlDriver, type User } from "../lib/db.ts";

const user = (id: string, email: string): User => ({
  id, email, emailVerified: false, passwordHash: "x", name: id, tag: id, avatar: null, role: "member",
  referralCode: `R-${id}`, referredBy: null, devices: [], sessionEpoch: 0, failedLogins: 0, lockedUntil: null,
  prefs: { hideBalances: false, emailNotifs: true, tgNotifs: true }, timeZone: null,
  streak: { count: 0, lastDay: null, lastAt: null }, maxTier: 0, lastHolding: null, qualifiedReferrals: 0, createdAt: 0,
});

async function suite(name: string, db: ReturnType<typeof makeDb>) {
  await db.tx((t) => t.insert("users", user("a", "a@x.io")));

  // unique keys are enforced (case-insensitive email)
  await assert.rejects(db.tx((t) => t.insert("users", user("b", "A@X.io"))), Conflict);
  assert.equal(await db.get("users", "b"), null, "failed insert left nothing behind");

  // 25 concurrent read-modify-writes: none lost
  await Promise.all(
    Array.from({ length: 25 }, () =>
      db.tx(async (t) => {
        const u = (await t.get("users", "a"))!;
        await t.put("users", { ...u, qualifiedReferrals: u.qualifiedReferrals + 1 });
      }),
    ),
  );
  const a = (await db.get("users", "a"))!;
  assert.equal(a.qualifiedReferrals, 25);
  assert.equal(a.v, 26, "version stamped on every write");

  // a stale write is refused and the whole transaction rolls back
  await assert.rejects(
    db.tx(async (t) => {
      const u = (await t.get("users", "a"))!;
      await t.put("users", { ...u, name: "first" });
      await t.put("users", { ...u, name: "stale" }); // same old version
    }),
  );
  assert.equal((await db.get("users", "a"))!.name, "a", "rolled back");

  // changing a unique field releases the old key
  await db.tx(async (t) => t.put("users", { ...(await t.get("users", "a"))!, email: "new@x.io" }));
  await db.tx((t) => t.insert("users", user("c", "a@x.io")));
  assert.equal((await db.find("users", "email", "a@x.io"))[0].id, "c");

  // verified wallets are unique across accounts; pending ones are not
  const w = (id: string, userId: string, status: "pending" | "verified") => ({
    id, userId, address: "GABC", primary: true, status, memo: "", memoAt: 0, proofTx: null, createdAt: 0, verifiedAt: null,
  });
  await db.tx((t) => t.insert("wallets", w("w1", "a", "verified")));
  await db.tx((t) => t.insert("wallets", w("w2", "c", "pending")));
  await assert.rejects(db.tx(async (t) => t.put("wallets", { ...(await t.get("wallets", "w2"))!, status: "verified" })), Conflict);

  console.log(`db (${name}): ok`);
}

const dir = mkdtempSync(path.join(tmpdir(), "xlmt-db-"));
process.chdir(dir); // the default JSON store lives under cwd/.data; keep it out of the project
const { db: jsonDb } = await import("../lib/db.ts");
await suite("json", jsonDb);

const pg = new PGlite();
await pg.exec(SCHEMA);
let chain: Promise<unknown> = Promise.resolve(); // PGlite has one connection: run transactions one at a time
const pgDb = makeDb(
  sqlDriver((fn) => {
    const job = chain.then(() =>
      pg.transaction((t) =>
        fn(async (text, params) => {
          const r = await t.query<Record<string, unknown>>(text, params as unknown[]);
          return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
        }),
      ),
    );
    chain = job.catch(() => {});
    return job;
  }),
);
await suite("postgres", pgDb);
