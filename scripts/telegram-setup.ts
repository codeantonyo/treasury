// Run: npm run telegram-setup -- https://xlmtreasury.vercel.app
// Points @XLMTreasuryBot at the deployed app: webhook, menu button, commands, descriptions.
// Reads TELEGRAM_BOT_TOKEN from .env (the same token as on Vercel). Prints no secrets.
import { botApi, webhookSecret } from "../lib/telegram.ts";

const url = (process.argv[2] ?? "").replace(/\/$/, "");
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!/^https:\/\/[^/]+$/.test(url)) throw new Error("Pass the app's https URL, e.g. npm run telegram-setup -- https://xlmtreasury.vercel.app");
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set in .env");

const me = await botApi<{ username: string }>(token, "getMe", {});
await botApi(token, "setWebhook", { url: `${url}/api/telegram`, secret_token: webhookSecret(token), allowed_updates: ["message"], drop_pending_updates: true });
await botApi(token, "setChatMenuButton", { menu_button: { type: "web_app", text: "Open", web_app: { url } } });
await botApi(token, "setMyCommands", { commands: [{ command: "start", description: "Open XLM TREASURY" }] });
await botApi(token, "setMyShortDescription", { short_description: "Hold XLMTREASURY2, climb 12 tiers, collect your daily streak." });
await botApi(token, "setMyDescription", {
  description: "XLM TREASURY: link your Stellar wallet, hold XLMTREASURY2, climb 12 tiers, collect your daily streak and earn for every friend you bring.",
});
const info = await botApi<{ url: string; pending_update_count: number; last_error_message?: string }>(token, "getWebhookInfo", {});
console.log(`@${me.username}: webhook ${info.url}, menu button → ${url}${info.last_error_message ? `, last error: ${info.last_error_message}` : ""}`);
