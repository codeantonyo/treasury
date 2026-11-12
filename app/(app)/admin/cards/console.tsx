"use client";

import { useState, useTransition } from "react";

const ACTIONS: [string, string, ("amount" | "freeze" | "text")?][] = [
  ["status", "Record"],
  ["ensure", "Create customer"],
  ["balance", "Balance"],
  ["list", "Cards"],
  ["transactions", "Transactions"],
  ["raw", "Raw card replies (diagnose)"],
  ["sync", "Sync now"],
  ["bins", "BINs"],
  ["currencies", "Currencies"],
  ["fund-member", "Deposit invoice $ (pay it yourself)", "amount"],
  ["issue", "Issue with load $", "amount"],
  ["fund-card", "Move $ from their balance onto the card", "amount"],
  ["freeze", "Freeze", "freeze"],
  ["close-card", "Close card"],
  ["secrets", "Card details (diagnostics)"],
  ["notify", "Message member", "text"],
  ["forget", "Forget record"],
];
const DANGER = new Set(["issue", "fund-card", "close-card", "forget"]);
const btn = "press rounded-xl border border-white/14 bg-white/5 px-3 py-2 text-xs font-extrabold";

/** Operator console: every call goes to /api/admin/cards; money actions ask first. */
export default function CardsConsole() {
  const [member, setMember] = useState("");
  const [amount, setAmount] = useState("");
  const [text, setText] = useState("");
  const [out, setOut] = useState<unknown>(null);
  const [pending, start] = useTransition();

  const call = (action: string, extra: Record<string, unknown> = {}) =>
    start(async () => {
      const r = await fetch("/api/admin/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, member, ...extra }) });
      setOut(await r.json().catch(() => ({ status: r.status })));
    });

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={pending} onClick={() => call("mode")}>Mode & ladder</button>
        <button className={btn} disabled={pending} onClick={() => call("waiting")}>Waiting to be loaded</button>
        <button className={btn} disabled={pending} onClick={() => call("cardholders")}>Cardholders</button>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
        <input className="h-11 rounded-xl bg-black/30 px-3 text-sm" placeholder="Member: username, email or id" value={member} onChange={(e) => setMember(e.target.value)} />
        <div className="flex gap-2">
          <input className="h-11 w-32 rounded-xl bg-black/30 px-3 text-sm" placeholder="Amount $" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="h-11 grow rounded-xl bg-black/30 px-3 text-sm" placeholder="Message (for Message member)" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(([action, label, needs]) => (
            <button
              key={action}
              className={`${btn} ${DANGER.has(action) ? "border-ember/40 text-ember" : ""}`}
              disabled={pending || !member}
              onClick={() => {
                if (DANGER.has(action) && !confirm(`${label}${needs === "amount" ? ` ${amount}` : ""} for ${member}? This can move real money.`)) return;
                call(action, needs === "amount" ? { amount: Number(amount) } : needs === "freeze" ? { freeze: confirm("OK = freeze, Cancel = unfreeze") } : needs === "text" ? { text } : {});
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <pre className="max-h-[60dvh] overflow-auto rounded-2xl bg-black/40 p-3 text-[11px] leading-snug whitespace-pre-wrap text-muted-2">
        {pending ? "…" : out === null ? "Results show here." : JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}
