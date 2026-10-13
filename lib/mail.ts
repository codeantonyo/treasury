// Transactional email via Brevo, in the app's look: ink ground, violet glow header, white button.
// Without BREVO_API_KEY in development, mail is printed to the server console instead (so codes can
// be tested locally); in production it fails loudly.

export type Mail = {
  subject: string;
  preheader: string; // the grey preview line in the inbox
  title: string;
  name: string;
  lines: string[];
  code?: string;
  button?: { label: string; url: string };
  footnote: string;
};

const C = { ink: "#07060b", card: "#110d1c", line: "#241d36", paper: "#f4f2fa", onPaper: "#140e22", text: "#c8c2da", muted: "#9a93b3", dim: "#6b6484", lilac: "#c9b6ff", violet: "#7b3fff" };
const FONT = "'Manrope','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const base = () => (process.env.APP_URL ?? "https://xlmtreasury.vercel.app").replace(/\/$/, "");

/** Table-based HTML (works in Gmail, Outlook, Apple Mail) plus a plain-text twin. */
export function renderMail(m: Mail): { html: string; text: string } {
  const p = (s: string) => `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:${C.text}">${esc(s)}</p>`;
  const code = m.code
    ? `<tr><td style="padding:6px 0 22px"><div style="background:#1b1530;border:1px solid #4a2c96;border-radius:16px;padding:18px 0;text-align:center;font:800 34px/1 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:10px;color:${C.paper}">${esc(m.code)}</div></td></tr>`
    : "";
  const button = m.button
    ? `<tr><td style="padding:6px 0 22px"><a href="${esc(m.button.url)}" style="display:block;background:${C.paper};color:${C.onPaper};text-decoration:none;text-align:center;border-radius:14px;padding:15px 0;font:800 15px/1 ${FONT}">${esc(m.button.label)}</a></td></tr>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(m.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ink}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:24px;overflow:hidden">
<tr><td><img src="${base()}/brand/logo.png" width="560" alt="XLM TREASURY" style="display:block;width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:30px 32px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td><h1 style="margin:0 0 18px;font:800 24px/1.25 ${FONT};color:${C.paper}">${esc(m.title)}</h1></td></tr>
<tr><td>${p(`Hi ${m.name},`)}${m.lines.map(p).join("")}</td></tr>
${code}${button}
<tr><td style="padding:0 0 24px;border-bottom:1px solid ${C.line}"><p style="margin:0;font:400 13px/1.55 ${FONT};color:${C.muted}">${esc(m.footnote)}</p></td></tr>
</table></td></tr>
<tr><td style="padding:18px 32px 26px"><p style="margin:0;font:400 12px/1.6 ${FONT};color:${C.dim}">You're receiving this because of your XLM TREASURY account. We'll never ask for your password or your wallet's secret key.<br><a href="${base()}" style="color:${C.lilac};text-decoration:none">${esc(base().replace(/^https?:\/\//, ""))}</a> · <a href="https://t.me/XLMTreasuryBot" style="color:${C.lilac};text-decoration:none">@XLMTreasuryBot</a></p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [`Hi ${m.name},`, "", ...m.lines, ...(m.code ? ["", m.code] : []), ...(m.button ? ["", `${m.button.label}: ${m.button.url}`] : []), "", m.footnote, "", "XLM TREASURY"].join("\n");
  return { html, text };
}

export async function sendMail(to: string, m: Mail) {
  const { html, text } = renderMail(m);
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[mail:dev] to=${to}\n[mail:dev] subject=${m.subject}\n${text}\n`);
      return;
    }
    throw new Error("Email is not configured");
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM_EMAIL, name: process.env.MAIL_FROM_NAME ?? "XLM TREASURY" },
      to: [{ email: to }],
      subject: m.subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status})`);
}
