// Run: node scripts/check-keypad.ts — the amount keypad never produces an amount the server would misread.
import assert from "node:assert/strict";
import { pressKey } from "../lib/currencies.ts";

const type = (keys: string, decimals = 2) => [...keys].reduce((v, k) => pressKey(v, k === "<" ? "del" : k, decimals), "");
assert.equal(type("0012"), "12", "no leading zeros");
assert.equal(type(".5"), "0.5", "leading point gets a zero");
assert.equal(type("1..2"), "1.2", "one decimal point");
assert.equal(type("1.239"), "1.23", "fiat: 2 decimals");
assert.equal(type("1.123456789", 7), "1.1234567", "XLM: 7 decimals");
assert.equal(type("12.5", 0), "125", "JPY: no decimal point");
assert.equal(type("12<<<"), "", "delete to empty");
assert.equal(type("9999999999999"), "999999999999", "12-digit cap");
console.log("keypad: ok");
