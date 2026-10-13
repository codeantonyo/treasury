// Run: node scripts/check-telegram.ts — Mini App initData is accepted only when signed by our bot and fresh.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyInitData } from "../lib/telegram.ts";

const TOKEN = "123456:TEST-token-for-checks-only";
const now = Date.parse("2026-10-13T12:00:00Z");
function sign(fields: Record<string, string>, token = TOKEN) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
}
const fields = { auth_date: String(now / 1000 - 60), query_id: "AAH", user: JSON.stringify({ id: 4242, first_name: "Ann", username: "ann" }), start_param: "TRSY-ABC123" };

assert.deepEqual(verifyInitData(sign(fields), TOKEN, now), { id: 4242, username: "ann", firstName: "Ann", startParam: "TRSY-ABC123" });
assert.ok(verifyInitData(sign({ ...fields, signature: "abc" }), TOKEN, now), "newer clients send `signature`");
assert.equal(verifyInitData(sign(fields, "999:other-bot"), TOKEN, now), null, "another bot's signature");
assert.equal(verifyInitData(sign(fields).replace("4242", "4243"), TOKEN, now), null, "tampered user");
assert.equal(verifyInitData(sign({ ...fields, auth_date: String(now / 1000 - 25 * 3600) }), TOKEN, now), null, "older than 24 h");
assert.equal(verifyInitData("user=x", TOKEN, now), null, "no hash");
console.log("telegram: ok");
