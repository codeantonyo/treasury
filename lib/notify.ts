import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { botApi } from "./telegram";

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * Tell a member something: an in-app notice (the bell) and, when they linked Telegram and kept
 * "Telegram messages" on, a DM from @XLMTreasuryBot. `html` uses Telegram's HTML subset.
 * Returns whether the Telegram message went out.
 */
export async function notifyMember(userId: string, html: string, opts: { inApp?: boolean } = {}): Promise<boolean> {
  try {
    if (opts.inApp !== false) await db.tx((t) => t.insert("notifications", { id: randomUUID(), userId, at: Date.now(), text: plain(html), read: false }));
    const u = await db.get("users", userId);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !u?.telegramId || !u.prefs.tgNotifs) return false;
    await botApi(token, "sendMessage", { chat_id: Number(u.telegramId), text: html, parse_mode: "HTML", disable_web_page_preview: true });
    return true;
  } catch {
    return false; // a member who never started the bot can't be messaged; the in-app notice still stands
  }
}

/** Tell every admin (in-app + Telegram). */
export async function notifyAdmins(html: string) {
  for (const a of await db.find("users", "role", "admin")) await notifyMember(a.id, html);
}
