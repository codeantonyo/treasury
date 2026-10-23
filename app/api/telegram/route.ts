import { timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/account";
import { botApi, webhookSecret } from "@/lib/telegram";
import { MAIN_TOKEN } from "@/lib/tokens";

type Update = { message?: { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } } };

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Welcome card: banner image, short HTML caption, Open button plus token links. */
function welcome(app: string, firstName: string | undefined, ref: string | null) {
  const caption = [
    `<b>Welcome to XLM TREASURY${firstName ? `, ${esc(firstName.slice(0, 40))}` : ""}</b>`,
    "Your Stellar treasury, right inside Telegram.",
    "",
    `💎 <b>Hold ${MAIN_TOKEN.code}</b> and climb 12 tiers`,
    "🔥 <b>Collect your daily streak</b>, boosted by your tier",
    "💳 <b>In-app cards</b> for your rewards",
    `🤝 <b>Invite friends</b>: you both get a 200% bonus on their first ${MAIN_TOKEN.code} purchase`,
    "",
    ref ? `🎁 You were invited: your code <code>${esc(ref)}</code> is filled in for you.` : "Link your Stellar wallet in a minute. We never ask for your secret key.",
  ].join("\n");
  const reply_markup = {
    inline_keyboard: [
      [{ text: "🚀 Open XLM TREASURY", web_app: { url: `${app}${ref ? `/register?ref=${ref}` : "/"}` } }],
      [
        { text: `📈 Buy ${MAIN_TOKEN.code}`, url: `https://lobstr.co/trade/${MAIN_TOKEN.code}:${MAIN_TOKEN.issuer}` },
        { text: "🌐 Website", url: `https://${MAIN_TOKEN.homeDomain ?? "xlmtreasuryv2.com"}` },
      ],
    ],
  };
  return { caption, reply_markup };
}

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

  try {
    if (cmd === "/start") {
      const w = welcome(app, m.from?.first_name, ref);
      // The banner is drawn by the app (/brand/welcome.png); if Telegram can't fetch it, send the text alone.
      await botApi(token!, "sendPhoto", { chat_id: m.chat.id, photo: `${app}/brand/welcome.png`, caption: w.caption, parse_mode: "HTML", reply_markup: w.reply_markup }).catch(() =>
        botApi(token!, "sendMessage", { chat_id: m.chat.id, text: w.caption, parse_mode: "HTML", reply_markup: w.reply_markup }),
      );
    } else
      await botApi(token!, "sendMessage", {
        chat_id: m.chat.id,
        text: "Tap <b>Open XLM TREASURY</b> below, or use the <b>Open</b> button next to the message box.",
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🚀 Open XLM TREASURY", web_app: { url: `${app}/` } }]] },
      });
  } catch (e) {
    console.error("telegram webhook:", (e as Error).message);
  }
  return Response.json({ ok: true }); // always 200 so Telegram doesn't retry
}
