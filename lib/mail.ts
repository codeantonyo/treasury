// Transactional email via Brevo. Without BREVO_API_KEY in development, mail is printed to the
// server console instead (so codes can be tested locally); in production it fails loudly.

export async function sendMail(to: string, subject: string, text: string) {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[mail:dev] to=${to}\n[mail:dev] subject=${subject}\n${text}\n`);
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
      subject,
      textContent: text,
      htmlContent: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-line">${escape(text)}</div>`,
    }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status})`);
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
