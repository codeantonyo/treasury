// Telegram: Mini App sign-in (initData checked against the bot token) and Bot API calls.
// No `server-only`: scripts use it too. The bot token never leaves the server.
import { createHmac, timingSafeEqual } from "node:crypto";

export const BOT_USERNAME = "XLMTreasuryBot";
const MAX_AGE_S = 24 * 3600;

export type TgUser = { id: number; username: string | null; firstName: string; startParam: string | null };

const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/**
 * The Telegram user in a Mini App's initData, or null if it isn't signed by our bot or is older than 24 h.
 * Checked as Telegram documents it; also accepts the check string without `signature` (older clients).
 */
export function verifyInitData(initData: string, botToken: string, now = Date.now()): TgUser | null {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
  const secret = hmac("WebAppData", botToken);
  const checkString = (skip: string[]) =>
    [...p.entries()].filter(([k]) => !skip.includes(k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const want = Buffer.from(hash, "hex");
  const ok = [["hash"], ["hash", "signature"]].some((skip) => timingSafeEqual(hmac(secret, checkString(skip)), want));
  if (!ok) return null;
  const age = now / 1000 - Number(p.get("auth_date"));
  if (!(age < MAX_AGE_S && age > -300)) return null;
  try {
    const u = JSON.parse(p.get("user") ?? "") as { id: number; username?: string; first_name?: string };
    if (!Number.isSafeInteger(u.id)) return null;
    return { id: u.id, username: u.username ?? null, firstName: u.first_name ?? "", startParam: p.get("start_param") };
  } catch {
    return null;
  }
}

/** Secret Telegram sends back on every webhook call (derived from the token: nothing extra to configure). */
export const webhookSecret = (botToken: string) => hmac(botToken, "xlmtreasury-webhook").toString("base64url");

/** Call the Bot API. Throws with Telegram's description on failure (never includes the token). */
export async function botApi<R = unknown>(botToken: string, method: string, body: object): Promise<R> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: R; description?: string };
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? res.status}`);
  return j.result as R;
}
