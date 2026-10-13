import { createHash } from "node:crypto";

// Card-style details for in-app cards (owner's call to show them). They look real but can never
// work as a payment card: prefix 8 belongs to no card network, and the check digit is chosen to
// FAIL the Luhn check, so every checkout form and card-testing script rejects the number.

export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/** Stable per card: same card → same number, expiry (5 years after creation) and CVV. */
export function cardDetails(cardKey: string, createdAt: number) {
  const h = createHash("sha256").update(`xlmt-card:${cardKey}`).digest();
  const body = "8" + Array.from(h.subarray(0, 14), (b) => b % 10).join(""); // 15 digits
  let check = 0;
  while (luhnValid(body + check)) check++; // exactly one digit 0-9 is Luhn-valid: skip it
  const number = body + check;
  const issued = new Date(createdAt);
  const exp = new Date(Date.UTC(issued.getUTCFullYear() + 5, issued.getUTCMonth(), 1));
  return {
    number: number.replace(/(\d{4})(?=\d)/g, "$1 "),
    last4: number.slice(-4),
    expiry: `${String(exp.getUTCMonth() + 1).padStart(2, "0")}/${String(exp.getUTCFullYear()).slice(2)}`,
    cvv: String(h.readUInt16BE(14) % 1000).padStart(3, "0"),
  };
}
