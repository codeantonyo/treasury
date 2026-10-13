// Run: node scripts/check-card-number.ts
// Guards the one property that matters: an in-app card number must never pass the Luhn check.
import assert from "node:assert/strict";
import { cardDetails, luhnValid } from "../lib/card-number.ts";

assert.ok(luhnValid("4111111111111111"), "Luhn reference number");
assert.ok(!luhnValid("4111111111111112"));

const created = Date.UTC(2026, 9, 12);
for (let i = 0; i < 10_000; i++) {
  const c = cardDetails(`card-${i}`, created);
  const digits = c.number.replace(/ /g, "");
  assert.match(digits, /^8\d{15}$/);
  assert.ok(!luhnValid(digits), `Luhn-valid number for card-${i}`);
  assert.equal(c.last4, digits.slice(-4));
  assert.match(c.cvv, /^\d{3}$/);
  assert.equal(c.expiry, "10/31");
}
assert.deepEqual(cardDetails("a", created), cardDetails("a", created), "stable per card");
assert.notEqual(cardDetails("a", created).number, cardDetails("b", created).number, "different cards differ");
console.log("card-number: ok");
