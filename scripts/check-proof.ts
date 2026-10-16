// Run: node scripts/check-proof.ts — which payments prove a wallet (judged by payment time, any of its codes).
import assert from "node:assert/strict";
import { isProof, PROOF_WINDOW } from "../lib/stellar.ts";

const T = "GTREASURY", ME = "GMEMBER";
const at = Date.parse("2026-10-15T15:35:00Z");
const pay = (o: Record<string, unknown> = {}) => ({
  type: "payment", from: ME, to: T, amount: "1.0000000", asset_type: "native", transaction_successful: true,
  created_at: "2026-10-15T16:16:42Z", transaction: { memo_type: "text", memo: "XT-F7DC4C" }, ...o,
});
const codes = [{ memo: "XT-F7DC4C", at }];

assert.ok(isProof(pay(), { treasury: T, from: ME, codes }), "sent 41 min after the code: still counts (tapping verify late is fine)");
assert.ok(isProof(pay({ transaction: { memo_type: "text", memo: "XT-OLD111" } }), { treasury: T, from: ME, codes: [{ memo: "XT-OLD111", at: at - 3600_000 }, ...codes] }), "an earlier code still counts");
assert.ok(!isProof(pay({ created_at: new Date(at + PROOF_WINDOW + 60_000).toISOString() }), { treasury: T, from: ME, codes }), "sent after the window");
assert.ok(!isProof(pay({ created_at: new Date(at - 5 * 60_000).toISOString() }), { treasury: T, from: ME, codes }), "sent before the code existed");
assert.ok(!isProof(pay({ transaction: { memo_type: "none" } }), { treasury: T, from: ME, codes }), "no memo");
assert.ok(!isProof(pay({ transaction: { memo_type: "text", memo: "XT-OTHER" } }), { treasury: T, from: ME, codes }), "someone else's code");
assert.ok(!isProof(pay({ from: "GSTRANGER" }), { treasury: T, from: ME, codes }), "paid from another wallet");
assert.ok(!isProof(pay({ to: "GELSEWHERE" }), { treasury: T, from: ME, codes }), "paid to another address");
assert.ok(!isProof(pay({ amount: "0.5000000" }), { treasury: T, from: ME, codes }), "less than 1");
assert.ok(!isProof(pay({ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GX" }), { treasury: T, from: ME, codes }), "wrong asset");
assert.ok(!isProof(pay({ transaction_successful: false }), { treasury: T, from: ME, codes }), "failed transaction");
console.log("proof: ok");
