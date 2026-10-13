// Pay queued referral rewards in XLMTREASURY2 from the distributor account.
//
//   node --env-file-if-exists=.env scripts/pay-referrals.ts            dry run (default): shows what would be paid
//   node --env-file-if-exists=.env scripts/pay-referrals.ts --apply    sends the payments
//
// Reads DISTRIBUTOR_SECRET from the environment (never printed). Uses POSTGRES_URL when set, else the
// local JSON store. Never pays twice: each payout has a unique memo that is looked up on Stellar before
// sending, and every transaction expires after 2 minutes so a crash can't leave an unknown payment.
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { db, type Payout } from "../lib/db.ts";
import { findSentWithMemo, hasTrustline, HORIZON, tokenBalance } from "../lib/stellar.ts";
import { MAIN_TOKEN } from "../lib/tokens.ts";

const apply = process.argv.includes("--apply");
// The local JSON store holds test accounts whose "verified" wallets may belong to strangers
// (dev-only verification). Never pay from it.
if (apply && !process.env.POSTGRES_URL) throw new Error("Refusing to --apply against the local test database. Set POSTGRES_URL to the real database.");
const secret = process.env.DISTRIBUTOR_SECRET;
if (!secret) throw new Error("DISTRIBUTOR_SECRET is not set");
const distributor = Keypair.fromSecret(secret);
const server = new Horizon.Server(HORIZON);
const asset = new Asset(MAIN_TOKEN.code, MAIN_TOKEN.issuer!);

console.log(`${apply ? "APPLY" : "DRY RUN"} · database: ${process.env.POSTGRES_URL ? "Postgres (POSTGRES_URL)" : "local .data/db.json"}`);
console.log(`distributor ${distributor.publicKey()} holds ${await tokenBalance(distributor.publicKey())} ${MAIN_TOKEN.code}\n`);

const all = [...(await db.find("payouts", "status", "queued")), ...(await db.find("payouts", "status", "sending"))];
let total = 0;

for (const p of all) {
  const label = `${p.id} · ${p.amount} ${MAIN_TOKEN.code}`;

  // 1. Already on chain? (earlier run that crashed after submitting)
  const landed = await findSentWithMemo(distributor.publicKey(), p.memo);
  if (landed) {
    console.log(`✓ ${label} already paid in ${landed}${apply ? ", recording it" : ""}`);
    if (apply) await mark(p.id, (r) => ({ ...r, status: "sent", txHash: landed, sentAt: Date.now() }));
    continue;
  }
  if (p.status === "sending" && Date.now() < (p.sendingUntil ?? 0)) {
    console.log(`… ${label} is in flight, run again in 2 minutes`);
    continue;
  }

  // 2. Where to: the referrer's primary verified wallet (else their oldest verified one).
  const wallets = (await db.find("wallets", "userId", p.userId)).filter((w) => w.status === "verified");
  const dest = (wallets.find((w) => w.primary) ?? wallets.sort((a, b) => a.createdAt - b.createdAt)[0])?.address;
  if (!dest) {
    console.log(`- ${label}: member has no verified wallet yet, skipped`);
    continue;
  }
  if (!(await hasTrustline(dest))) {
    console.log(`- ${label}: ${dest} has no ${MAIN_TOKEN.code} trustline, skipped`);
    continue;
  }

  total += p.amount;
  if (!apply) {
    console.log(`→ ${label} to ${dest} (memo ${p.memo})`);
    continue;
  }

  // 3. Claim it, then send. The transaction is only valid for 120 s; 5 extra minutes cover clock drift.
  const until = Date.now() + 120_000;
  await mark(p.id, (r) => ({ ...r, status: "sending", sendingUntil: until + 300_000, destination: dest }));
  try {
    const account = await server.loadAccount(distributor.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
      .addOperation(Operation.payment({ destination: dest, asset, amount: String(p.amount) }))
      .addMemo(Memo.text(p.memo))
      .setTimeout(120)
      .build();
    tx.sign(distributor);
    const res = await server.submitTransaction(tx);
    await mark(p.id, (r) => ({ ...r, status: "sent", txHash: res.hash, sentAt: Date.now(), error: undefined }));
    console.log(`✓ ${label} sent to ${dest} in ${res.hash}`);
  } catch (e) {
    const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response?.data?.extras?.result_codes;
    // A rejected transaction never lands: safe to queue again. Anything else stays "sending" until the
    // time limit passes; the next run then finds it on chain or re-queues it.
    if (codes) await mark(p.id, (r) => ({ ...r, status: "queued", sendingUntil: undefined, error: JSON.stringify(codes) }));
    console.log(`✗ ${label}: ${codes ? JSON.stringify(codes) : (e as Error).message}`);
  }
}

console.log(`\n${apply ? "Sent" : "Would send"} ${total} ${MAIN_TOKEN.code} across the payouts above.`);

async function mark(id: string, fn: (p: Payout) => Payout) {
  await db.tx(async (t) => {
    const p = await t.get("payouts", id);
    if (p) await t.put("payouts", fn(p));
  });
}
