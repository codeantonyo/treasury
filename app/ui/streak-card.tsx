"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { shortNum } from "@/lib/currencies";
import { collectStreak, type MoneyResult } from "../(app)/actions";
import { CheckIcon, FlameIcon } from "./icons";

type Day = { day: number; xlm: number; state: "done" | "today" | "next" };
const tiny = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Daily streak: the week's rewards, today's collect, and the tier boost. */
export default function StreakCard({
  count,
  collected,
  today,
  tomorrow,
  week,
  boost,
  tier,
  lock,
}: {
  count: number;
  collected: boolean;
  today: number;
  tomorrow: number;
  week: Day[];
  boost: number;
  tier: number;
  lock: "wallet" | "hold" | null; // why the member can't collect
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<MoneyResult | null>(null);
  const collect = () =>
    start(async () => {
      setRes(await collectStreak(Intl.DateTimeFormat().resolvedOptions().timeZone));
    });

  return (
    <section id="streak" className="relative flex scroll-mt-4 flex-col gap-3.5 overflow-hidden rounded-[22px] border border-ember/25 bg-linear-160 from-[#2a160a] via-[#170f1f] to-[#100b19] p-4">
      <span className="pointer-events-none absolute -top-24 -left-16 size-60 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,184,107,0.2), transparent 65%)" }} />

      <div className="relative flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <FlameIcon className="text-ember" />
          <span className="font-display text-lg font-extrabold">{count ? `${count}-day streak` : "Daily streak"}</span>
        </span>
        <span className="rounded-full bg-ember/15 px-2.5 py-1 text-[11px] font-extrabold text-ember tabular-nums">
          {tier ? `Tier ${tier} · ×${boost}` : "×1 boost"}
        </span>
      </div>

      <ol className="relative grid grid-cols-7 gap-1.5" aria-label="This week's rewards">
        {week.map((d) => (
          <li
            key={d.day}
            aria-label={`Day ${d.day}: ${d.xlm} XLM, ${d.state}`}
            className={`flex h-[58px] flex-col items-center justify-center gap-1 rounded-[12px] border text-center transition-colors ${
              d.state === "done"
                ? "border-ember/0 bg-ember text-[#2a1405]"
                : d.state === "today"
                  ? "border-ember bg-ember/12 text-white"
                  : "border-white/8 bg-white/[0.04] text-muted"
            }`}
          >
            <span className="text-[9.5px] font-extrabold tracking-[0.08em] opacity-80">D{d.day}</span>
            {d.state === "done" ? <CheckIcon size={14} /> : <span className="text-[11px] font-extrabold tabular-nums">{tiny(d.xlm)}</span>}
          </li>
        ))}
      </ol>

      {lock ? (
        <Link href={lock === "wallet" ? "/profile/settings" : "/wallet/XLMTREASURY2"} className="press relative flex h-12 items-center justify-center rounded-[16px] border border-ember/40 text-sm font-extrabold text-ember">
          {lock === "wallet" ? "Link a wallet to start your streak" : "Hold XLMTREASURY2 to unlock your streak"}
        </Link>
      ) : collected || res?.ok ? (
        <div className="relative flex h-12 items-center justify-center gap-2 rounded-[16px] bg-white/[0.05] text-sm font-extrabold text-muted-2">
          <CheckIcon size={16} className="text-ember" />
          {res?.ok ?? "Collected"} · tomorrow {shortNum(tomorrow)} XLM
        </div>
      ) : (
        <button
          onClick={collect}
          disabled={pending}
          className="relative flex h-12 items-center justify-center rounded-[16px] bg-ember text-sm font-extrabold text-[#2a1405] transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-60"
        >
          {pending ? "Collecting…" : `Collect ${shortNum(today)} XLM`}
        </button>
      )}
      {res?.error && (
        <p role="alert" className="relative text-center text-[12px] font-semibold text-red-300">
          {res.error}
        </p>
      )}

      <p className="relative text-[10.5px] leading-snug text-dim">
        Collect every day: each day multiplies the last, up to day 7, then the week starts again. Miss a day and you&apos;re back to day 1. Your XLMTREASURY2 tier
        boosts every day. Lands as in-app balance where your rewards go.
      </p>
    </section>
  );
}
