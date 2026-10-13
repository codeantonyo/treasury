"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { collectTierRewards, setRewardDestination, type MoneyResult } from "../(app)/actions";

export type PocketOpt = { value: string; label: string; currency: string; units: string; active: boolean };

const input = "h-12 w-full rounded-[14px] border border-white/12 bg-white/5 px-3.5 text-base font-semibold text-paper outline-none focus:border-violet-2";
const primary = "h-12 w-full rounded-[14px] bg-paper text-sm font-extrabold text-on-paper transition-transform active:scale-[0.98] disabled:opacity-50";

/** One idempotency key per attempt: reused on a retry of the same submit, replaced after an answer. */
function useAction() {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [res, setRes] = useState<MoneyResult>();
  const [pending, start] = useTransition();
  const go = (fn: (key: string) => Promise<MoneyResult>, after?: (r: MoneyResult) => void) =>
    start(async () => {
      const r = await fn(key);
      setRes(r);
      setKey(crypto.randomUUID());
      after?.(r);
    });
  return { key, res, pending, go, clear: () => setRes(undefined) };
}

function Result({ res }: { res?: MoneyResult }) {
  if (!res?.error && !res?.ok) return null;
  return (
    <p role={res.error ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${res.error ? "bg-red-500/12 text-red-300" : "bg-violet/15 text-lilac-soft"}`}>
      {res.error ?? res.ok}
    </p>
  );
}

export function DestinationSelect({ options, value }: { options: PocketOpt[]; value: string }) {
  const [v, setV] = useState(value);
  const a = useAction();
  return (
    <div className="flex flex-col gap-2">
      <select
        value={v}
        disabled={a.pending}
        onChange={(e) => {
          setV(e.target.value);
          a.go(() => setRewardDestination(e.target.value));
        }}
        aria-label="Send my rewards to"
        className={`${input} appearance-none`}
      >
        {options.filter((o) => o.active).map((o) => (
          <option key={o.value} value={o.value} className="bg-[#140e22]">
            {o.label}
          </option>
        ))}
      </select>
      <Result res={a.res?.error ? a.res : undefined} />
    </div>
  );
}

/** Collect lands in the default destination with no picker; "Change" sends this one elsewhere. */
export function CollectButton({ cards, defaultDest, disabled }: { cards: PocketOpt[]; defaultDest: string | null; disabled?: boolean }) {
  const [dest, setDest] = useState(defaultDest);
  const [changing, setChanging] = useState(false);
  const a = useAction();
  if (!cards.some((c) => c.active))
    return (
      <Link href="/card" className={`${primary} flex items-center justify-center`}>
        Create a card to collect
      </Link>
    );
  const label = cards.find((c) => c.value === dest)?.label ?? "your card";
  return (
    <div className="flex flex-col gap-2">
      <button disabled={a.pending || disabled} onClick={() => a.go((key) => collectTierRewards(key, dest ?? undefined))} className={primary}>
        {a.pending ? "Collecting…" : "Collect"}
      </button>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-2">
        Lands in <b className="text-paper">{label}</b>
        <button onClick={() => setChanging((c) => !c)} className="font-bold text-lilac">
          Change
        </button>
      </div>
      {changing && (
        <select value={dest ?? ""} onChange={(e) => setDest(e.target.value)} aria-label="Collect to" className={`${input} appearance-none`}>
          {cards.filter((c) => c.active).map((c) => (
            <option key={c.value} value={c.value} className="bg-[#140e22]">
              {c.label}
            </option>
          ))}
        </select>
      )}
      <Result res={a.res} />
    </div>
  );
}
