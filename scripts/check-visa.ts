// Run: node scripts/check-visa.ts — StellarPay Visa rules that move or report real money, offline.
import assert from "node:assert/strict";
import {
  cardCostUsd,
  cardCreditUsd,
  cardLoadUsd,
  cardNameOf,
  classifyWl,
  declineReason,
  isCredited,
  isMobile,
  isPumpHold,
  isUsableCard,
  isZeroVerification,
  otpOf,
  settledAuths,
  topupCostUsd,
  txKey,
  txStatus,
  waveOpen,
} from "../lib/visa/pure.ts";

// issuer replies: 202 / pending = money moved, never retry; only a clean 4xx means nothing was charged
assert.deepEqual([classifyWl(202, {}).ok, classifyWl(202, {}).pending], [false, true]);
assert.equal(classifyWl(200, { pending: true }).pending, true, "a pending body is pending even on 200");
assert.equal(classifyWl(402, { message: "Insufficient balance" }).ok, false);
assert.equal(classifyWl(402, {}).pending, undefined);
assert.equal(classifyWl(200, { success: true, data: { id: 1 } }).ok, true);
assert.equal(classifyWl(500, {}).message, "Card issuer error (500)");

// deposit credited: exact words only ("confirming" must not pass)
assert.ok(isCredited("completed") && isCredited("Confirmed") && isCredited(" paid "));
assert.ok(!isCredited("confirming") && !isCredited("pending") && !isCredited(undefined));

// never adopt a failed or deleted card
assert.ok(isUsableCard({ status: "active" }) && isUsableCard({ status: "frozen" }) && isUsableCard({ status: "processing" }));
for (const s of ["closed", "deleted", "failed", "declined", "rejected", "cancelled", "terminated", "error"]) assert.ok(!isUsableCard({ status: s }), s);

// one-time codes
assert.equal(otpOf({ type: "OTP", merchant: "Apple Pay code 482913" }), "482913");
assert.equal(otpOf({ type: "OTP", merchant: "Apple Pay" }), "", "expired code row: a code with no digits, never sent");
assert.equal(otpOf({ type: "Authorize", merchant: "Amazon card verification", amount: 0 }), undefined, "$0 card check is not a code");
assert.equal(otpOf({ type: "auth", merchant: "3DS passcode 1234" }), "1234");
assert.equal(otpOf({ type: "Purchase", merchant: "Tesco", amount: 12.5 }), undefined);
assert.equal(otpOf({ type: "verification", reason: "amount 123456.78" }), undefined, "digits inside a decimal are not a code");
assert.equal(otpOf({ type: "OTP", merchant: "APPLE PAY", amount: 0, description: "Your code is 551203", txn_id: "ctx_123456ab", date: "2026-11-12 18:02:00" }), "551203", "code in another field; ids/dates ignored");
assert.equal(otpOf({ type: "OTP", merchant: "GOOGLE *TEMPORARY HOLD", txn_id: "ctx_99123456" }), "", "digits in a txn id are not a code");
assert.ok(isZeroVerification({ type: "Authorize", merchant: "Amazon", amount: 0 }));

// a payment settling is the same payment
assert.equal(txKey({ date: "d", type: "Purchase", merchant: "M", amount: 5, status: "pending" }), txKey({ date: "d", type: "Purchase", merchant: "M", amount: 5, status: "completed" }));

// statuses
assert.deepEqual(["Declined", "reversal", "refunded", "FAILED", "pending", "authorized", "processing", "success"].map(txStatus), ["declined", "reversed", "reversed", "failed", "pending", "pending", "pending", "completed"]);

// authorization ↔ settlement pairs
const auth = { date: "2026-11-01T10:00:00Z", type: "Authorize", merchant: "Cafe", amount: 20, status: "success" };
const cap = { date: "2026-11-02T10:00:00Z", type: "Capture", merchant: "cafe ", amount: 20, status: "success" };
assert.equal(settledAuths([cap, auth]).get(auth), cap, "exact pair (case/space-insensitive merchant)");
const tip = { ...cap, amount: 24 };
assert.equal(settledAuths([tip, auth]).get(auth), tip, "tip up to 30% within 10 days");
assert.equal(settledAuths([{ ...cap, amount: 27 }, auth]).size, 0, "more than 30% is not a tip");
assert.equal(settledAuths([{ ...cap, date: "2026-11-20T10:00:00Z", amount: 24 }, auth]).size, 0, "a tip after 10 days doesn't pair");
const pump = { date: "2026-11-01T10:00:00Z", type: "Authorize", merchant: "SHELL 123", amount: 100, status: "pending" };
assert.ok(isPumpHold(pump));
const fill = { date: "2026-11-01T11:00:00Z", type: "Purchase", merchant: "SHELL 123", amount: 37.4, status: "completed" };
assert.equal(settledAuths([fill, pump]).get(pump), fill, "pump hold settles to less");
assert.equal(settledAuths([{ ...cap, status: "declined" }, auth]).size, 0, "declined never pairs");
assert.equal(settledAuths([{ ...cap, date: "2026-10-31T10:00:00Z" }, auth]).size, 0, "a settlement can't predate its authorization");
const two = settledAuths([auth, { ...auth, date: "2026-11-01T10:05:00Z" }, cap]);
assert.equal(two.size, 1, "each settlement pairs once");

// declines: member-facing, always "nothing was charged"
assert.equal(declineReason("", "MoonPay").title, "Crypto purchases aren't supported");
assert.equal(declineReason("insufficient funds", "Tesco", 4.5).title, "Not enough on the card");
assert.match(declineReason("insufficient funds", "Tesco", 4.5).hint, /\$4\.50 available/);
assert.equal(declineReason("weird", "Tesco").title, "Declined by the card network");
for (const r of ["", "cvv", "expired", "3ds", "frozen", "avs", "velocity", "mcc"]) assert.match(declineReason(r, "Shop").hint, /Nothing was charged/);
assert.ok(!/kripi/i.test(JSON.stringify(["", "cvv", "x"].map((r) => declineReason(r, "Shop")))), "never names the issuer");

// legal name and mobile
assert.equal(cardNameOf("  José   Álvarez "), "JOSE ALVAREZ");
assert.equal(cardNameOf("Mary-Jane O'Neil"), "MARY-JANE O'NEIL");
assert.equal(cardNameOf("@kimjoyce"), null, "never a username");
assert.equal(cardNameOf("Madonna"), null, "first + last name");
assert.equal(cardNameOf("A".repeat(14) + " " + "B".repeat(14)), null, "26 characters max");
assert.ok(isMobile("+14155551234") && !isMobile("4155551234") && !isMobile("+12"));

// the owner's ladder: no card below Tier 3; T3 $20 … T12 $8,000
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(cardLoadUsd), [0, 0, 0, 20, 50, 100, 200, 400, 1000, 2000, 4000, 6000, 8000]);

// fees
assert.equal(cardCostUsd(100), 110.2, "$6.20 + 4%");
assert.equal(cardCreditUsd(20), 27, "a Tier 3 card: load $27 (card $20 + fee)");
assert.equal(cardCreditUsd(8000), 8327, "a Tier 12 card: load $8,327 ($8,000 + $6.20 + 4%)");
assert.equal(topupCostUsd(25), 27.08);
// release waves: only the tiers listed see and can get the card
assert.deepEqual([2, 3, 4, 5].map((t) => waveOpen(t, "3-4")), [false, true, true, false], "wave 1: Tier 3–4");
assert.deepEqual([4, 5, 6, 7].map((t) => waveOpen(t, "3-6")), [true, true, true, false], "wave 2 adds 5–6");
assert.deepEqual([3, 5, 7].map((t) => waveOpen(t, "3,5")), [true, true, false]);
assert.ok(waveOpen(12, "all") && !waveOpen(null, "all") && !waveOpen(4, ""), "unset = nobody but the testers");
console.log("visa: ok");
