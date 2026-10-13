import { timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/account";
import { botApi, webhookSecret } from "@/lib/telegram";

type Update = { message?: { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } } };

/** Bot webhook (set by `npm run telegram-setup`). Telegram proves itself with the secret header. */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = token ? Buffer.from(webhookSecret(token)) : null;
  if (!want || got.length !== want.length || !timingSafeEqual(got, want)) return new Response("forbidden", { status: 403 });

  const m = ((await req.json().catch(() => ({}))) as Update).message;
  if (!m?.text || m.chat.type !== "private") return Response.json({ ok: true });

  const [cmd, arg] = m.text.trim().split(/\s+/, 2);
  const app = await appUrl();
  const ref = arg && /^[A-Za-z0-9-]{4,20}$/.test(arg) ? arg.toUpperCase() : null;
  const open = (text: string, path = "/") => ({ inline_keyboard: [[{ text, web_app: { url: `${app}${path}` } }]] });

  try {
    if (cmd === "/start")
      await botApi(token!, "sendMessage", {
        chat_id: m.chat.id,
        text:
          `Welcome to XLM TREASURY${m.from?.first_name ? `, ${m.from.first_name}` : ""}.\n\n` +
          "Hold XLMTREASURY2, climb 12 tiers, collect your daily streak and invite friends.\n\nTap below to open the app.",
        reply_markup: open("Open XLM TREASURY", ref ? `/register?ref=${ref}` : "/"),
      });
    else
      await botApi(token!, "sendMessage", {
        chat_id: m.chat.id,
        text: "Open XLM TREASURY with the button below, or with the menu button next to the message box.",
        reply_markup: open("Open XLM TREASURY"),
      });
  } catch (e) {
    console.error("telegram webhook:", (e as Error).message);
  }
  return Response.json({ ok: true }); // always 200 so Telegram doesn't retry
}
