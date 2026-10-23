// Pay due referral rewards in XLMTREASURY2, by hand (the app also does this automatically when
// PAYOUTS_AUTO=on in Vercel). Same engine and safeguards as the app: lib/payouts.ts.
//
//   node --env-file-if-exists=.env scripts/pay-referrals.ts            dry run (default): shows what would be paid
//   node --env-file-if-exists=.env scripts/pay-referrals.ts --apply    sends the payments
//   ... --apply --allow-large                                           also sends single payouts above the daily limit
//
// Reads PAYOUT_SECRET (or DISTRIBUTOR_SECRET) from the environment, never printed. --apply needs POSTGRES_URL.
import { db } from "../lib/db.ts";
import { stellarDeps } from "../lib/payout-stellar.ts";
import { runPayouts } from "../lib/payouts.ts";
import { MAIN_TOKEN } from "../lib/tokens.ts";

const apply = process.argv.includes("--apply");
// The local JSON store holds test accounts whose "verified" wallets may belong to strangers. Never pay from it.
if (apply && !process.env.POSTGRES_URL) throw new Error("Refusing to --apply against the local test database. Set POSTGRES_URL to the real database.");
const secret = process.env.PAYOUT_SECRET ?? process.env.DISTRIBUTOR_SECRET;
if (!secret) throw new Error("PAYOUT_SECRET (or DISTRIBUTOR_SECRET) is not set");
const d = stellarDeps(db, secret);

console.log(`${apply ? "APPLY" : "DRY RUN"} · database: ${process.env.POSTGRES_URL ? "Postgres (POSTGRES_URL)" : "local .data/db.json"}`);
console.log(`payout account ${d.account} holds ${await d.balance()} ${MAIN_TOKEN.code}\n`);
const { ran, outcomes } = await runPayouts(d, !apply, { allowLarge: process.argv.includes("--allow-large") });
if (!ran) console.log("Another payout run is in progress (the app's automatic run). Try again in a few minutes.");
for (const o of outcomes) console.log(`${o.result.padEnd(12)} ${o.id} · ${o.amount} ${MAIN_TOKEN.code}${"tx" in o ? ` · ${o.tx}` : ` · ${o.why}`}`);
console.log(`\n${outcomes.length} payout(s) checked.`);
