"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, LockIcon, SnowIcon, XlmMark } from "../../ui/icons";
import Sheet from "../../ui/sheet";

// The real card. Member-facing copy never names the card issuer.
const CARD = "StellarPay Visa";

type CardView = { id: string; last4?: string; status?: string; expiry?: string; frozen: boolean; pending: boolean; waiting: boolean; detailsReady: boolean } | null;
type Notice = { id: string; at: number; kind: string; title: string; body: string };
type Row = { id: string; merchant: string; amount: number; currency: string; at: string; group: string; status: string; kind: string; code?: string; note?: string; hint?: string };
type State = {
  enabled: boolean;
  eligible: boolean;
  tier?: number | null;
  minTier?: number;
  loadUsd?: number;
  hasWallet?: boolean;
  available?: number | null;
  otpEmail?: string | null;
  card: CardView;
  progress?: { loaded: boolean; creating: boolean; created: boolean; active: boolean; wallet: boolean; delayed: boolean; stalled: boolean };
  slow?: boolean;
  wallet?: "apple" | "google" | null;
  notices?: Notice[];
};

const usd = (n: number, c = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
};
const mmyy = (ym?: string) => (ym && /^\d{4}-\d{2}$/.test(ym) ? `${ym.slice(5)}/${ym.slice(2, 4)}` : ym ?? "••/••");
const btn = "press flex h-11 items-center justify-center gap-1.5 rounded-[14px] border border-white/14 bg-white/5 px-3 text-[13px] font-extrabold disabled:opacity-50";
const primary = "press flex h-12 w-full items-center justify-center rounded-[16px] bg-paper text-sm font-extrabold text-on-paper disabled:opacity-60";

async function post<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T & { ok?: boolean; message?: string }> {
  const r = await fetch("/api/visa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, message: "Something went wrong. Please try again." }));
}

/** The card itself: dark, violet-lit, the Stellar mark, last 4, expiry. */
function VisaFace({ last4, expiry, name, frozen, dim }: { last4?: string; expiry?: string; name?: string; frozen?: boolean; dim?: boolean }) {
  return (
    <div
      className={`relative aspect-[1.586] w-full overflow-hidden rounded-[22px] p-[18px] text-paper select-none ${dim ? "opacity-70 grayscale-[0.4]" : ""}`}
      style={{
        background: "radial-gradient(120% 90% at 0% 0%, rgba(160,107,255,0.45), transparent 55%), linear-gradient(125deg, #07060b 0%, #160f2b 45%, #2a1a5c 80%, #3b1c7a 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(160,107,255,0.55), 0 18px 40px rgba(0,0,0,0.5)",
      }}
    >
      <span className="pointer-events-none absolute -right-6 bottom-[-18%] text-white/[0.07]">
        <XlmMark size={190} />
      </span>
      <div className="relative flex items-start justify-between">
        <span className="flex flex-col">
          <span className="font-display text-[17px] leading-tight font-extrabold">StellarPay</span>
          <span className="text-[10px] font-bold tracking-[0.18em] opacity-60">XLM TREASURY</span>
        </span>
        <svg viewBox="0 0 24 24" width="22" height="22" className="opacity-80" aria-hidden="true">
          <path d="M8 6.5a8 8 0 0 1 0 11M12 4a11.5 11.5 0 0 1 0 16M16 2a15 15 0 0 1 0 20" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <span className="absolute top-[42%] left-[18px] h-7 w-10 rounded-md" style={{ background: "linear-gradient(135deg, #e9e6f3, #8f8aa6)" }} />
      <div className="absolute inset-x-[18px] bottom-[16px] flex items-end justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[15px] font-bold tracking-[0.16em]">•••• {last4 ?? "••••"}</span>
          <span className="truncate text-[10px] font-bold tracking-[0.12em] opacity-70">{name ? `${name} · ` : ""}VALID THRU {expiry ?? "••/••"}</span>
        </span>
        <span className="font-display text-[22px] font-extrabold tracking-tight italic">VISA</span>
      </div>
      {frozen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#0b0916]/55 backdrop-blur-[3px]">
          <SnowIcon size={26} />
          <span className="text-sm font-extrabold">Frozen</span>
        </div>
      )}
    </div>
  );
}

/** The StellarPay Visa block at the top of the Cards tab. */
export default function VisaSection() {
  const [s, setS] = useState<State | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "setup" | "details" | "wallet" | "close">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/visa").then((x) => x.json()).catch(() => null);
    if (r) setS(r);
  }, []);
  const poll = useCallback(async () => {
    const r = await post<{ activity?: Row[] | null; card?: CardView; available?: number | null; otp?: string | null; notices?: Notice[]; issued?: boolean }>({ action: "activity" });
    if (r.activity !== undefined && r.activity !== null) setRows(r.activity);
    if (r.otp) setOtp(r.otp);
    if (r.issued) void load();
    else if (r.card !== undefined) setS((p) => (p ? { ...p, card: r.card ?? p.card, available: r.available ?? p.available, notices: r.notices ?? p.notices } : p));
  }, [load]);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  // Activity and codes: every 8 s while the tab is visible (3 s while adding to a wallet).
  const hasCard = !!s?.card;
  useEffect(() => {
    if (!hasCard) return;
    void poll(); // eslint-disable-line react-hooks/set-state-in-effect
    const every = sheet === "wallet" ? 3000 : 8000;
    const id = setInterval(() => document.visibilityState === "visible" && void poll(), every);
    return () => clearInterval(id);
  }, [hasCard, sheet, poll]);

  if (!s) return <div className="aspect-[1.586] w-full animate-pulse rounded-[22px] bg-white/5" />;
  if (!s.enabled) return null;

  const card = s.card;
  const live = card && !card.waiting;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">YOUR CARD</span>
        {live && typeof s.available === "number" && <span className="text-xs font-bold text-muted">{usd(s.available)} available</span>}
      </div>
      {s.slow && <p className="rounded-xl bg-ember/10 px-3 py-2 text-xs font-semibold text-ember">The card network is slow right now: new payments may show up a little late.</p>}

      {!s.eligible ? (
        <Locked s={s} />
      ) : !card ? (
        <Get s={s} onStart={() => setSheet("setup")} />
      ) : card.waiting ? (
        <Waiting s={s} />
      ) : (
        <Live
          s={s}
          rows={rows}
          busy={busy}
          onDetails={() => setSheet("details")}
          onWallet={() => setSheet("wallet")}
          onClose={() => setSheet("close")}
          onFreeze={async () => {
            setBusy(true);
            const r = await post<{ card?: CardView }>({ action: card.frozen ? "unfreeze" : "freeze" });
            setBusy(false);
            if (r.card) setS({ ...s, card: r.card });
            if (!r.ok && r.message) setMsg(r.message);
          }}
          onReceipt={async (id) => {
            const r = await post({ action: "receipt", id });
            setMsg(r.ok ? "Receipt sent to your Telegram." : r.message ?? "Couldn't send the receipt.");
          }}
        />
      )}
      {msg && (
        <button onClick={() => setMsg(null)} className="rounded-xl bg-white/5 px-3 py-2 text-left text-xs font-semibold text-muted-2">
          {msg}
        </button>
      )}

      <Sheet open={sheet === "setup"} onClose={() => setSheet(null)} title={`Your ${CARD}`}>
        <Setup
          loadUsd={s.loadUsd ?? 0}
          onDone={async (r) => {
            setSheet(null);
            if (r.message && !r.ok) setMsg(r.message);
            await load();
          }}
        />
      </Sheet>
      <Sheet open={sheet === "details"} onClose={() => setSheet(null)} title="Card details">
        {sheet === "details" && <Details />}
      </Sheet>
      <Sheet open={sheet === "wallet"} onClose={() => setSheet(null)} title="Add to your phone">
        <AddToWallet
          otp={otp}
          email={s.otpEmail ?? null}
          onAdded={async (w) => {
            const r = await post({ action: "set-wallet", wallet: w });
            if (r.ok) {
              setSheet(null);
              await load();
            }
          }}
        />
      </Sheet>
      <Sheet open={sheet === "close"} onClose={() => setSheet(null)} title="Close your card">
        <CloseCard
          last4={card?.last4}
          onClosed={async (r) => {
            setSheet(null);
            setMsg(r.ok ? `Card closed. ${usd(Number(r.remaining ?? 0))} returned to XLM TREASURY.` : r.message ?? "Couldn't close the card.");
            setRows(null);
            await load();
          }}
        />
      </Sheet>
    </section>
  );
}

function Locked({ s }: { s: State }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <VisaFace dim />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-extrabold backdrop-blur">
            <LockIcon size={14} /> Unlocks at Tier {s.minTier}
          </span>
        </span>
      </div>
      <p className="text-[13px] leading-snug text-muted-2">
        A real Visa you can spend anywhere, loaded by XLM TREASURY: from $20 at Tier 3 up to $8,000 at Tier 12, by how much XLMTREASURY2 you hold.
        {s.hasWallet ? (s.tier ? ` You're Tier ${s.tier}.` : "") : " Link a Stellar wallet first."}
      </p>
      <Link href={s.hasWallet ? "/wallet/XLMTREASURY2" : "/profile/settings"} className={btn}>
        {s.hasWallet ? "See the tiers" : "Link a wallet"}
      </Link>
    </div>
  );
}

function Get({ s, onStart }: { s: State; onStart: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <VisaFace />
      <p className="text-[13px] leading-snug text-muted-2">
        Your Tier {s.tier ?? s.minTier} card is loaded with <b className="text-paper">{usd(s.loadUsd ?? 0)}</b> by XLM TREASURY. Spend it anywhere Visa is accepted, online or with Apple Pay and Google Pay.
      </p>
      <button className={primary} onClick={onStart}>
        Get my {CARD}
      </button>
    </div>
  );
}

const STEPS: [keyof NonNullable<State["progress"]>, string][] = [
  ["loaded", "Loaded by XLM TREASURY"],
  ["created", "Card created"],
  ["active", "Card active"],
  ["wallet", "In your phone's wallet"],
];

function Waiting({ s }: { s: State }) {
  const p = s.progress;
  return (
    <div className="flex flex-col gap-3">
      <VisaFace dim />
      <div className="flex flex-col gap-2 rounded-[18px] border border-white/10 bg-white/[0.035] p-3.5">
        <span className="text-sm font-extrabold">Your card is requested</span>
        <ol className="flex flex-col gap-1.5">
          {STEPS.map(([k, label]) => (
            <li key={k} className={`flex items-center gap-2 text-[13px] ${p?.[k] ? "text-paper" : "text-muted"}`}>
              <span className={`flex size-5 items-center justify-center rounded-full ${p?.[k] ? "bg-violet-2 text-white" : "border border-white/20"}`}>{p?.[k] && <CheckIcon size={12} />}</span>
              {label}
            </li>
          ))}
        </ol>
        <span className="text-xs text-muted">
          {p?.stalled
            ? "This is taking longer than usual: we're chasing it with the card network."
            : `XLM TREASURY loads ${s.loadUsd ? usd(s.loadUsd) : "your card"} based on your tier, then the card is created automatically. This page updates by itself, and you'll get a message when it's live.`}
        </span>
      </div>
    </div>
  );
}

function Live(props: { s: State; rows: Row[] | null; busy: boolean; onDetails: () => void; onWallet: () => void; onClose: () => void; onFreeze: () => void; onReceipt: (id: string) => void }) {
  const { s, rows } = props;
  const card = s.card!;
  const target = s.loadUsd ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <VisaFace last4={card.last4} expiry={mmyy(card.expiry)} frozen={card.frozen} />
      {card.pending && <p className="text-xs text-muted">The card network is approving your card: details unlock the moment it&apos;s active.</p>}
      <p className="text-xs text-muted-2">
        Loaded by XLM TREASURY based on your tier{s.tier ? ` (Tier ${s.tier}: ${usd(target)})` : ""}. You get a message every time it&apos;s loaded.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <button className={btn} disabled={!card.detailsReady} onClick={props.onDetails}>
          Details
        </button>
        <button className={btn} disabled={props.busy || card.pending} onClick={props.onFreeze}>
          <SnowIcon size={15} /> {card.frozen ? "Unfreeze" : "Freeze"}
        </button>
        <button className={btn} disabled={!card.detailsReady} onClick={props.onWallet}>
          {s.wallet ? "In wallet" : "Add to Pay"}
        </button>
      </div>
      <div className="flex flex-col rounded-[18px] border border-white/10 bg-white/[0.035]">
        {rows === null ? (
          <p className="px-4 py-3 text-xs text-muted">Loading activity…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted">No payments yet. Every payment shows up here.</p>
        ) : (
          rows.slice(0, 20).map((r) => (
            <button key={r.id} onClick={() => r.kind !== "otp" && props.onReceipt(r.id)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-left not-last:border-b not-last:border-white/[0.06]">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-bold">{r.kind === "otp" ? `Verification code ${r.code ?? "(expired)"}` : r.merchant}</span>
                <span className="truncate text-[11px] text-muted">
                  {r.at ? new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </span>
              {r.kind !== "otp" && (
                <span className={`shrink-0 text-[13px] font-extrabold tabular-nums ${["declined", "failed"].includes(r.status) ? "text-red-300 line-through" : r.group === "Purchase" ? "text-paper" : "text-lilac-soft"}`}>
                  {r.group === "Purchase" ? "−" : "+"}
                  {usd(r.amount, r.currency)}
                </span>
              )}
            </button>
          ))
        )}
      </div>
      <button onClick={props.onClose} className="self-start text-xs font-bold text-muted underline-offset-4 hover:underline">
        Close card
      </button>
    </div>
  );
}

function Setup({ loadUsd, onDone }: { loadUsd: number; onDone: (r: { ok?: boolean; message?: string }) => void }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "h-12 w-full rounded-[14px] border border-white/10 bg-black/30 px-3.5 text-[15px] outline-none focus:border-violet-2";
  return (
    <div className="flex flex-col gap-3 pb-1">
      {busy ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="size-10 animate-spin rounded-full border-2 border-white/15 border-t-violet-2" />
          <span className="text-sm font-extrabold">Generating your card</span>
          <span className="max-w-[260px] text-xs text-muted">Setting up your card account{loadUsd ? ` for your ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(loadUsd)} card` : ""}. This takes a few seconds.</span>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-muted">Legal first and last name, exactly as on your ID</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="JANE DOE" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-muted">Mobile in international format</span>
            <input className={field} value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+14155551234" />
          </label>
          <p className="text-[11px] leading-snug text-muted">Stores and wallets compare the name on the card with your ID, and it can&apos;t be changed later. The card is loaded by XLM TREASURY; you never pay for it.</p>
          {err && <p className="rounded-xl bg-red-500/12 px-3 py-2 text-center text-[13px] font-semibold text-red-300">{err}</p>}
          <button
            className={primary}
            disabled={!name.trim() || !mobile.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              const r = await post({ action: "issue", cardName: name, mobile });
              setBusy(false);
              if (!r.ok) return setErr(r.message ?? "Something went wrong. Please try again.");
              onDone(r);
            }}
          >
            Issue my card
          </button>
        </>
      )}
    </div>
  );
}

/** Number, CVV, expiry: fetched live, hidden again after 30 s. */
function Details() {
  const [d, setD] = useState<{ number?: string; cvv?: string; expiry?: string; name?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  const [copied, setCopied] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void post<{ data?: { number?: string; cvv?: string; expiry?: string; name?: string } }>({ action: "reveal" }).then((r) => (r.ok ? setD(r.data ?? null) : setErr(r.message ?? "Couldn't load the details.")));
  }, []);
  useEffect(() => {
    if (!d) return;
    const id = setInterval(() => setLeft((n) => (n <= 1 ? (setD(null), 0) : n - 1)), 1000);
    return () => clearInterval(id);
  }, [d]);
  const copy = (k: string, v?: string) => v && navigator.clipboard.writeText(v).then(() => setCopied(k));
  if (err) return <p className="pb-2 text-sm text-muted-2">{err}</p>;
  if (!d) return <p className="pb-2 text-sm text-muted">{left === 0 ? "Hidden again for safety. Close and reopen to show them." : "Loading…"}</p>;
  const line = (k: string, label: string, v?: string, shown?: string) => (
    <li className="flex items-center justify-between gap-3 px-4 py-3 not-last:border-b not-last:border-white/[0.06]">
      <span className="flex flex-col">
        <span className="text-[11px] font-bold text-muted">{label}</span>
        <span className="font-mono text-[15px] font-bold tracking-[0.08em]">{shown ?? v}</span>
      </span>
      <button onClick={() => copy(k, v)} className={`${btn} h-9`}>
        {copied === k ? <CheckIcon size={14} /> : <CopyIcon />} {copied === k ? "Copied" : "Copy"}
      </button>
    </li>
  );
  return (
    <div className="flex flex-col gap-3 pb-1">
      <ul className="rounded-[18px] border border-white/10 bg-white/[0.035]">
        {line("n", "Card number", d.number, d.number?.replace(/(\d{4})(?=\d)/g, "$1 "))}
        {line("e", "Expiry", d.expiry ? mmyy(d.expiry) : undefined)}
        {line("c", "CVV", d.cvv)}
        {d.name && line("h", "Name on card", d.name)}
      </ul>
      <p className="text-center text-[11px] text-muted">Hides in {left}s. Never share these with anyone.</p>
    </div>
  );
}

/**
 * Apple/Google Pay asks how to verify the card: the member picks Email. The card issuer then sends the
 * code to the card account's email AND lists it on the card, which this sheet polls every 3 s.
 */
function AddToWallet({ otp, email, onAdded }: { otp: string | null; email: string | null; onAdded: (w: "apple" | "google") => void }) {
  return (
    <div className="flex flex-col gap-3 pb-1 text-[13px] leading-snug text-muted-2">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li>Tap Details here and copy your card number, expiry and CVV.</li>
        <li>Open Wallet (iPhone) or Google Wallet, tap Add card, and enter them manually.</li>
        <li>
          When it asks how to verify, choose <b className="text-paper">Email</b>
          {email ? (
            <>
              {" "}
              (<span className="font-mono text-paper">{email}</span>)
            </>
          ) : null}
          . Keep this screen open: the code appears below within seconds.
        </li>
      </ol>
      <div className="flex flex-col items-center gap-1 rounded-[18px] border border-violet-2/40 bg-violet/10 py-4">
        <span className="text-[11px] font-bold tracking-[0.16em] text-muted">VERIFICATION CODE</span>
        <span className="font-mono text-[30px] font-extrabold tracking-[0.2em] text-paper">{otp ?? "— — —"}</span>
        {otp ? (
          <button onClick={() => void navigator.clipboard.writeText(otp)} className="text-[11px] font-bold text-lilac">
            Copy · enter it in your wallet now, it expires in a few minutes
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 animate-pulse rounded-full bg-violet-2" /> Waiting for the code…
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">The same code also arrives in that inbox{email ? "" : ""} and, if you opened the app from @XLMTreasuryBot, on Telegram.</p>
      <div className="grid grid-cols-2 gap-2">
        <button className={btn} onClick={() => onAdded("apple")}>
          I added it to Apple Pay
        </button>
        <button className={btn} onClick={() => onAdded("google")}>
          I added it to Google Pay
        </button>
      </div>
    </div>
  );
}

function CloseCard({ last4, onClosed }: { last4?: string; onClosed: (r: { ok?: boolean; message?: string; remaining?: number }) => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-[13px] leading-snug text-muted-2">
        Closing ··{last4} is permanent. Anything left on it goes back to XLM TREASURY (it was loaded by XLM TREASURY), and the card stops working everywhere, including Apple Pay and Google Pay. You can issue a new one afterwards.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          if (!armed) return setArmed(true);
          setBusy(true);
          onClosed(await post<{ remaining?: number }>({ action: "close" }));
        }}
        className={`press flex h-12 w-full items-center justify-center rounded-[16px] text-sm font-extrabold ${armed ? "bg-red-400 text-[#1a0508]" : "border border-red-400/40 text-red-300"}`}
      >
        {busy ? "Closing…" : armed ? "Tap again to close for good" : "Close card"}
      </button>
    </div>
  );
}
