"use client";

// Shared pieces for in-app money screens (Cards and Account): action buttons, sheets with the
// amount pad, success state, menu rows and the grouped activity list.
import { useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { formatMoney } from "@/lib/currencies";
import type { ActivityRow } from "@/lib/money-view";
import { lookupMember, moveMoney, sendMoney, type MoneyResult } from "../(app)/actions";
import AmountPad from "./amount-pad";
import Avatar from "./avatar";
import { ArrowInIcon, ArrowOutIcon, ChevronIcon, GiftIcon, SwapIcon, XIcon } from "./icons";

export type PocketData = { value: string; label: string; currency: string; units: string; active: boolean };

export const n7 = (units: string) => Number(BigInt(units)) / 1e7;
export const amt = (v: string) => Number(v || "0");
export const longDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const btn = "press flex h-14 w-full items-center justify-center rounded-[18px] text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40";
export const primaryBtn = `${btn} bg-paper text-on-paper`;
export const dangerBtn = `${btn} bg-red-400 text-[#1a0508]`;
export const quietBtn = "press flex h-12 w-full items-center justify-center rounded-[16px] text-sm font-extrabold text-muted-2";

/** One idempotency key per attempt: reused if the same submit is retried, replaced after an answer. */
export function useMoney() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [res, setRes] = useState<MoneyResult>();
  const [pending, start] = useTransition();
  const run = (fn: (key: string) => Promise<MoneyResult>, after?: (r: MoneyResult) => void) =>
    start(async () => {
      const r = await fn(key);
      setKey(crypto.randomUUID());
      setRes(r);
      after?.(r);
    });
  return { res, pending, run };
}

/** Amount text with its currency symbol in the UI font (Syne's €/£/$ read poorly at display sizes). */
export function Money({ text }: { text: string }) {
  const m = /^([^\d\s.,-]+)(.*)$/.exec(text);
  return m && !/[A-Z]{3}/.test(m[1]) ? (
    <>
      <span className="mr-0.5 font-sans">{m[1]}</span>
      {m[2]}
    </>
  ) : (
    <>{text}</>
  );
}

export function ErrorLine({ res }: { res?: MoneyResult }) {
  return res?.error ? (
    <p role="alert" className="rounded-xl bg-red-500/12 px-3 py-2 text-center text-[13px] font-semibold text-red-300">
      {res.error}
    </p>
  ) : null;
}

export function Success({ title, sub, onDone }: { title: string; sub: string; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-4 pb-2 text-center">
      <motion.span
        className="flex size-[76px] items-center justify-center rounded-full bg-violet/20 text-lilac-soft"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <motion.path d="M5 12.5 10 17l9-10" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.12, ease: [0.23, 1, 0.32, 1] }} />
        </svg>
      </motion.span>
      <h3 className="font-display text-2xl font-extrabold">
        <Money text={title} />
      </h3>
      <p className="max-w-[280px] text-sm text-muted-2">{sub}</p>
      <button onClick={onDone} className={`${primaryBtn} mt-3`}>
        Done
      </button>
    </div>
  );
}

export function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-muted-2">
      {icon && <span className="text-lilac">{icon}</span>}
      {children}
    </span>
  );
}

export type Action = { key: string; label: string; icon: React.ReactNode; primary?: boolean; disabled?: boolean; onClick: () => void };

/** The row of round action buttons under a balance. */
export function ActionRow({ actions }: { actions: Action[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((a) => (
        <button key={a.key} disabled={a.disabled} onClick={a.onClick} className="press flex flex-col items-center gap-2 disabled:opacity-35">
          <span
            className={`flex size-14 items-center justify-center rounded-full ${
              a.primary ? "bg-paper text-on-paper shadow-[0_10px_30px_rgba(244,242,250,0.18)]" : "border border-white/12 bg-white/[0.06]"
            }`}
          >
            {a.icon}
          </span>
          <span className="text-xs font-bold text-muted-2">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Horizontal pocket chooser (main account / cards) showing each balance. */
export function PocketPills({ options, value, onChange, label }: { options: PocketData[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-muted-2">{label}</span>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === value}
            className={`press flex shrink-0 flex-col items-start rounded-2xl border px-3.5 py-2.5 text-left ${
              o.value === value ? "border-paper bg-paper text-on-paper" : "border-white/12 bg-white/[0.04]"
            }`}
          >
            <span className="text-[13px] font-extrabold">{o.label}</span>
            <span className={`text-[11px] font-semibold tabular-nums ${o.value === value ? "text-on-paper/70" : "text-dim"}`}>{formatMoney(n7(o.units), o.currency)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Move money between the member's own pockets. "in": from a picked pocket into `fixed`;
 * "out": from `fixed` to a picked pocket. The server converts and checks everything.
 */
export function TransferSheet({
  mode,
  fixed,
  pockets,
  rates,
  onDone,
}: {
  mode: "in" | "out";
  fixed: PocketData;
  pockets: PocketData[];
  rates: Record<string, number> | null;
  onDone: () => void;
}) {
  const others = pockets.filter((p) => p.value !== fixed.value && p.active);
  const [other, setOther] = useState(others[0]?.value ?? "");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const m = useMoney();
  const o = others.find((p) => p.value === other) ?? others[0];
  if (!o) return <p className="pb-4 text-sm text-muted-2">There&apos;s nowhere to move money to yet. Create a card first.</p>;
  const src = mode === "in" ? o : fixed, dst = mode === "in" ? fixed : o;
  const over = amt(amount) > n7(src.units) ? `Only ${formatMoney(n7(src.units), src.currency)} on ${src.label}` : null;
  const hint =
    amt(amount) && rates && src.currency !== dst.currency ? `≈ ${formatMoney((amt(amount) * rates[dst.currency]) / rates[src.currency], dst.currency)} arrives` : null;
  const label = formatMoney(amt(amount), src.currency);

  if (done) return <Success title={done} sub={`${mode === "in" ? "Added to" : "Moved to"} ${dst.label}.`} onDone={onDone} />;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <PocketPills label={mode === "in" ? "From" : "To"} options={others} value={o.value} onChange={setOther} />
      <AmountPad value={amount} onChange={setAmount} currency={src.currency} maxUnits={src.units} hint={hint} over={over} />
      <ErrorLine res={m.res} />
      <button
        disabled={!amt(amount) || !!over || m.pending}
        onClick={() => m.run((key) => moveMoney(src.value, dst.value, amount, key), (r) => r.ok && setDone(label))}
        className={primaryBtn}
      >
        {m.pending ? "Working…" : amt(amount) ? `${mode === "in" ? "Top up" : "Move"} ${label}` : "Enter an amount"}
      </button>
    </div>
  );
}

type Found = { name: string; tag: string; avatar: string | null; self?: boolean } | null | "loading" | "none";

/** Send from a pocket to another member (by @username). It lands in their main account in XLM. */
export function SendSheet({ from, rates, onDone }: { from: PocketData; rates: Record<string, number> | null; onDone: () => void }) {
  const [step, setStep] = useState<"who" | "amount">("who");
  const [tag, setTag] = useState("");
  const [who, setWho] = useState<Found>(null);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const m = useMoney();

  const search = (v: string) => {
    setTag(v);
    clearTimeout(timer.current);
    const clean = v.trim().replace(/^@/, "");
    if (clean.length < 3) return setWho(null);
    setWho("loading");
    timer.current = setTimeout(async () => setWho((await lookupMember(clean)) ?? "none"), 300);
  };

  const over = amt(amount) > n7(from.units) ? `Only ${formatMoney(n7(from.units), from.currency)} on ${from.label}` : null;
  const label = formatMoney(amt(amount), from.currency);
  const person = typeof who === "object" && who !== null ? who : null;

  if (done && person) return <Success title={done} sub={`Sent to @${person.tag}. It's in their main account.`} onDone={onDone} />;

  if (step === "who" || !person)
    return (
      <div className="flex flex-col gap-4 pb-1">
        <label className="flex items-center gap-2 rounded-[18px] border border-white/12 bg-white/[0.05] px-4 focus-within:border-violet-2">
          <span className="font-display text-lg font-extrabold text-muted">@</span>
          <input
            autoFocus
            value={tag.replace(/^@/, "")}
            onChange={(e) => search(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-label="Member username"
            className="h-14 grow bg-transparent text-base font-bold text-paper outline-none placeholder:text-dim"
          />
        </label>
        <div className="min-h-[76px]">
          {who === "loading" && <div className="h-[76px] animate-pulse rounded-[18px] bg-white/[0.05]" />}
          {who === "none" && <p className="px-1 pt-2 text-sm text-muted-2">No member is called @{tag.replace(/^@/, "")}.</p>}
          {person && (
            <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] p-3.5">
              <Avatar src={person.avatar} name={person.name} size={44} />
              <div className="flex min-w-0 grow flex-col">
                <span className="truncate text-[15px] font-extrabold">{person.name}</span>
                <span className="truncate text-xs text-muted">@{person.tag}</span>
              </div>
              {person.self && <span className="text-xs font-bold text-ember">That&apos;s you</span>}
            </div>
          )}
        </div>
        <button disabled={!person || person.self} onClick={() => setStep("amount")} className={primaryBtn}>
          Continue
        </button>
      </div>
    );

  const xlm = rates && amt(amount) ? (amt(amount) * rates.XLM) / rates[from.currency] : null;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <button onClick={() => setStep("who")} className="press flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] p-3 text-left">
        <Avatar src={person.avatar} name={person.name} size={36} />
        <span className="grow text-sm font-extrabold">@{person.tag}</span>
        <span className="text-xs font-bold text-lilac">Change</span>
      </button>
      <AmountPad
        value={amount}
        onChange={setAmount}
        currency={from.currency}
        maxUnits={from.units}
        over={over}
        hint={xlm !== null && from.currency !== "XLM" ? `Arrives as ≈ ${formatMoney(xlm, "XLM")}` : `Arrives in @${person.tag}'s main account`}
      />
      <ErrorLine res={m.res} />
      <button
        disabled={!amt(amount) || !!over || m.pending}
        onClick={() => m.run((key) => sendMoney(person.tag, from.value, amount, key), (r) => r.ok && setDone(label))}
        className={primaryBtn}
      >
        {m.pending ? "Sending…" : amt(amount) ? `Send ${label}` : "Enter an amount"}
      </button>
    </div>
  );
}

export function MenuRow({
  icon,
  title,
  sub,
  onClick,
  danger,
  toggle,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
  danger?: boolean;
  toggle?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role={toggle !== undefined ? "switch" : undefined}
      aria-checked={toggle}
      className="press flex items-center gap-3.5 rounded-[18px] border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-left disabled:opacity-50"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-500/12 text-red-300" : "bg-white/[0.07] text-lilac"}`}>{icon}</span>
      <span className="flex min-w-0 grow flex-col">
        <span className={`text-[15px] font-extrabold ${danger ? "text-red-300" : ""}`}>{title}</span>
        <span className="truncate text-xs text-muted">{sub}</span>
      </span>
      {toggle !== undefined ? (
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${toggle ? "bg-violet" : "bg-white/15"}`}>
          <span className={`absolute top-1 left-1 size-5 rounded-full bg-paper transition-transform duration-200 ease-snappy ${toggle ? "translate-x-5" : ""}`} />
        </span>
      ) : (
        <ChevronIcon size={16} className="shrink-0 text-dim" />
      )}
    </button>
  );
}

function dayLabel(ms: number) {
  const d = new Date(ms), t = new Date();
  const y = new Date(t);
  y.setDate(t.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return same(d, t) ? "Today" : same(d, y) ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Movements grouped by day. With `pocket`, rows are signed from that pocket's point of view.
 * With `filters`, the member can switch between All and each pocket.
 */
export function Activity({
  rows,
  pocket,
  names,
  filters,
}: {
  rows: ActivityRow[];
  pocket?: string;
  names: Map<string, string>;
  filters?: { value: string; label: string }[];
}) {
  const [f, setF] = useState<string>("all");
  const view = pocket ?? (f === "all" ? undefined : f);
  const list = view ? rows.filter((r) => r.from === view || r.to === view || (view === "main" && r.kind === "in")) : rows;
  const groups: [string, ActivityRow[]][] = [];
  for (const r of list) {
    const label = dayLabel(r.at);
    const g = groups.find(([l]) => l === label);
    if (g) g[1].push(r);
    else groups.push([label, [r]]);
  }
  return (
    <section className="flex flex-col gap-3">
      <span className="eyebrow">ACTIVITY</span>
      {filters && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {[{ value: "all", label: "All" }, ...filters].map((x) => (
            <button
              key={x.value}
              onClick={() => setF(x.value)}
              aria-pressed={f === x.value}
              className={`press h-8 shrink-0 rounded-full px-3.5 text-xs font-extrabold ${f === x.value ? "bg-paper text-on-paper" : "border border-white/12 text-muted-2"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
      {!groups.length ? (
        <div className="flex flex-col items-center gap-1.5 rounded-[20px] border border-dashed border-white/12 px-6 py-8 text-center">
          <span className="text-sm font-bold">Nothing here yet</span>
          <span className="text-xs text-dim">Rewards, top-ups and transfers show up here.</span>
        </div>
      ) : (
        groups.map(([label, items]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="px-1 text-[11px] font-bold text-dim">{label}</span>
            <ul className="flex flex-col rounded-[20px] border border-white/10 bg-white/[0.035]">
              {items.map((r) => (
                <ActivityItem key={r.id} r={r} pocket={view} names={names} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function ActivityItem({ r, pocket, names }: { r: ActivityRow; pocket?: string; names: Map<string, string> }) {
  // Direction: relative to the pocket being viewed, or to the member's whole balance (moves are neutral).
  const dir = pocket
    ? r.to === pocket || (pocket === "main" && r.kind === "in")
      ? "in"
      : "out"
    : r.kind === "reward" || r.kind === "in"
      ? "in"
      : r.kind === "out"
        ? "out"
        : "move";
  const title = !pocket
    ? r.title
    : r.kind === "reward"
      ? r.title.split(" → ")[0]
      : r.kind === "in"
        ? r.title.split(" → ")[0]
        : r.kind === "close"
          ? dir === "in"
            ? `From ${r.title.replace(" card closed → Main account", "")} (closed)`
            : "Card closed"
          : r.kind === "out"
            ? r.title
            : dir === "in"
              ? `From ${names.get(r.from) ?? "a closed card"}`
              : `To ${names.get(r.to) ?? "a closed card"}`;
  const amount = dir === "in" ? `+${r.received}` : dir === "out" ? `−${r.sent ?? r.received}` : r.received;
  const other = dir === "in" ? r.sent : dir === "out" ? r.received : r.sent;
  const showOther = other && other !== (dir === "in" ? r.received : dir === "out" ? r.sent : r.received);
  return (
    <li className="flex items-center gap-3 px-3.5 py-3 not-last:border-b not-last:border-white/[0.06]">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          dir === "in" ? "bg-violet/20 text-lilac" : "bg-white/[0.07] text-muted-2"
        }`}
      >
        {r.kind === "reward" ? <GiftIcon size={16} /> : r.kind === "close" && dir !== "in" ? <XIcon size={16} /> : dir === "in" ? <ArrowInIcon /> : dir === "out" ? <ArrowOutIcon /> : <SwapIcon size={16} />}
      </span>
      <div className="flex min-w-0 grow flex-col">
        <span className="line-clamp-2 text-[13px] leading-snug font-bold">{title}</span>
        <span className="truncate text-[11px] text-dim">
          {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {showOther ? ` · ${dir === "in" ? "sent" : dir === "out" ? "arrived as" : "from"} ${other}` : ""}
        </span>
      </div>
      <span className={`shrink-0 text-[13px] font-extrabold tabular-nums ${dir === "in" ? "text-lilac-soft" : "text-paper"}`}>{amount}</span>
    </li>
  );
}
