"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney, shortNum } from "@/lib/currencies";
import { fluid } from "@/lib/format";
import type { SimView } from "@/lib/sim-view";
import { withdrawSimRewards } from "../../actions";
import { GiftIcon } from "../../../ui/icons";
import { ErrorLine, Money, PocketPills, primaryBtn, Success, useMoney, type PocketData } from "../../../ui/money-kit";
import Sheet from "../../../ui/sheet";

const DAY = 86_400_000;
const n = (v: number) => shortNum(v, v >= 1000 ? 0 : 2);
const compact = (v: number) => shortNum(v, 0);
/** Keeps the live total on one line at phone width as it grows. */
const heroSize = (t: string) => (t.length > 16 ? 21 : t.length > 13 ? 25 : t.length > 10 ? 30 : 34);
const usd = (v: number) => formatMoney(v, "USD");

/** Simulated tier rewards for one token: live totals, withdraw to a card, and the tier table. */
export default function SimRewardsPanel({
  view,
  ranges,
  cards,
  defaultCard,
  hidden,
}: {
  view: SimView;
  ranges: Record<number, string>;
  cards: PocketData[];
  defaultCard: string | null;
  hidden: boolean;
}) {
  const [now, setNow] = useState(view.serverNow);
  const [open, setOpen] = useState<string | null>(null); // "all" or an asset code
  useEffect(() => {
    if (!view.ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view.ticking]);

  const live = (a: SimView["assets"][number]) => Number(BigInt(a.ready)) / 1e7 + (a.perDay * Math.max(0, now - view.serverNow)) / DAY;
  const totalUsd = view.assets.reduce((s, a) => s + (a.priceUsd !== null ? live(a) * a.priceUsd : 0), 0);
  const perk = view.table.find((t) => t.n === view.tier)?.perk;
  const earning = view.tier > 0 && view.start;
  const any = view.assets.some((a) => live(a) > 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-[24px] border border-[#f0d078]/30 bg-linear-150 from-[#2a1d0c] via-[#1c1230] to-[#120c22] p-4">
        <span className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full" style={{ background: "radial-gradient(circle, rgba(240,208,120,0.22), transparent 65%)" }} />
        <span className="relative flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.18em] text-[#f0d078]">
          <GiftIcon size={14} /> REWARDS
        </span>

        <div className="relative flex flex-col gap-1">
          <span className="chrome font-display leading-none font-extrabold tabular-nums" style={{ fontSize: fluid(heroSize(`≈ ${usd(totalUsd)}`)) }}>
            {hidden ? "••••" : <Money text={`≈ ${usd(totalUsd)}`} />}
          </span>
          <span className="text-xs text-muted-2">
            {earning
              ? `Tier ${view.tier} · earning since ${new Date(view.start!.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${view.start!.exact ? "" : " (approx.)"}`
              : view.tier > 0
                ? `Tier ${view.tier}`
                : `Hold ${view.token} to start collecting`}
          </span>
          {perk && <span className="mt-1 self-start rounded-full bg-[#f0d078]/15 px-2.5 py-1 text-[11px] font-extrabold text-[#f0d078]">🌎 {perk}</span>}
        </div>

        <ul className="relative flex flex-col rounded-[18px] bg-black/25">
          {view.assets.map((a) => {
            const v = live(a);
            return (
              <li key={a.code} className="not-last:border-b not-last:border-white/[0.06]">
                <button onClick={() => setOpen(a.code)} disabled={v <= 0} className="press flex w-full items-center gap-3 px-3.5 py-3 text-left disabled:cursor-default">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-black/70" style={{ background: a.color }}>
                    {a.code.replace("26", "").slice(0, 3)}
                  </span>
                  <span className="flex min-w-0 grow flex-col">
                    <span className="text-sm font-extrabold">{a.code}</span>
                    <span className="truncate text-[11px] text-muted">
                      {a.perDay > 0 ? `+${compact(a.perDay)}${a.unit ? ` ${a.unit}` : ""}/day` : "Not earning"} · tracks {a.tracks}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-extrabold tabular-nums">{hidden ? "••••" : `${n(v)}${a.unit ? ` ${a.unit}` : ""}`}</span>
                    <span className="text-[11px] text-dim tabular-nums">{hidden || a.priceUsd === null ? "" : `≈ ${usd(v * a.priceUsd)}`}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <button disabled={!any} onClick={() => setOpen("all")} className={`relative ${primaryBtn}`}>
          Withdraw all to a card
        </button>
       
      </div>

      <details className="group rounded-[20px] border border-white/10 bg-white/[0.035]">
        <summary className="press flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
          What each tier earns per day
          <span className="text-lilac transition-transform duration-200 group-open:rotate-90">›</span>
        </summary>
        <ol className="flex flex-col gap-2 px-3 pb-3">
          {view.table.map((t) => (
            <li key={t.n} className={`flex flex-col gap-2 rounded-[16px] border p-3 ${t.n === view.tier ? "border-[#f0d078]/60 bg-[#f0d078]/[0.07]" : "border-white/[0.08] bg-black/20"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-base font-extrabold">Tier {t.n}</span>
                <span className="text-[11px] font-bold text-muted tabular-nums">{ranges[t.n]}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(t.perDay).map(([code, amount]) => (
                  <span key={code} className="flex flex-col rounded-lg bg-white/[0.04] px-2 py-1.5">
                    <span className="text-[10px] font-bold text-muted">{code}</span>
                    <span className="text-xs font-extrabold tabular-nums">{compact(amount)}</span>
                  </span>
                ))}
              </div>
              {t.perk && <span className="text-[11px] font-bold text-[#f0d078]">🌎 {t.perk}</span>}
            </li>
          ))}
        </ol>
      </details>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open === "all" ? "Withdraw rewards" : `Withdraw ${open}`}>
        {open && (
          <WithdrawSheet
            key={open}
            token={view.token}
            asset={open}
            assets={view.assets.filter((a) => open === "all" || a.code === open).map((a) => ({ code: a.code, unit: a.unit, amount: live(a), usd: a.priceUsd !== null ? live(a) * a.priceUsd : null }))}
            rates={view.rates}
            cards={cards}
            defaultCard={defaultCard}
            onDone={() => setOpen(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function WithdrawSheet({
  token,
  asset,
  assets,
  rates,
  cards,
  defaultCard,
  onDone,
}: {
  token: string;
  asset: string;
  assets: { code: string; unit: string | null; amount: number; usd: number | null }[];
  rates: Record<string, number> | null;
  cards: PocketData[];
  defaultCard: string | null;
  onDone: () => void;
}) {
  const [dest, setDest] = useState(defaultCard ?? cards[0]?.value ?? "");
  const [done, setDone] = useState<string | null>(null);
  const m = useMoney();
  const card = cards.find((c) => c.value === dest);
  const totalUsd = assets.reduce((s, a) => s + (a.usd ?? 0), 0);
  const inCard = card && rates ? (totalUsd / rates.USD) * rates[card.currency] : null;
  const label = inCard !== null && card ? formatMoney(inCard, card.currency) : null;

  if (!cards.length)
    return (
      <div className="flex flex-col items-center gap-3 pt-2 pb-2 text-center">
        <p className="max-w-[280px] text-sm text-muted-2">Rewards are withdrawn to a card. Create one first, then come back to collect.</p>
        <Link href="/card/new" className={`${primaryBtn} mt-2`}>
          Create a card
        </Link>
      </div>
    );
  if (done) return <Success title={`≈ ${done}`} sub={`Added to your ${card?.label ?? "card"} as in-app balance.`} onDone={onDone} />;

  return (
    <div className="flex flex-col gap-4 pb-1">
      <PocketPills label="To" options={cards} value={dest} onChange={setDest} />
      <ul className="flex flex-col rounded-[18px] border border-white/10 bg-white/[0.035]">
        {assets.map((a) => (
          <li key={a.code} className="flex items-center justify-between px-4 py-2.5 not-last:border-b not-last:border-white/[0.06]">
            <span className="text-sm font-bold">{a.code}</span>
            <span className="text-sm font-extrabold tabular-nums">
              {n(a.amount)}
              {a.unit ? ` ${a.unit}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center gap-0.5 py-1">
        <span className="text-xs font-bold text-muted">Lands on the card as about</span>
        <span className="chrome font-display text-[min(30px,7.69vw)] leading-tight font-extrabold tabular-nums">{label ? <Money text={label} /> : "—"}</span>
        <span className="text-[11px] text-dim">Final amount uses live prices when you confirm.</span>
      </div>
      <ErrorLine res={m.res} />
      <button
        disabled={!dest || m.pending}
        onClick={() => m.run((key) => withdrawSimRewards(token, asset, key, dest), (r) => r.ok && setDone(label ?? "done"))}
        className={primaryBtn}
      >
        {m.pending ? "Withdrawing…" : `Withdraw to ${card?.label ?? "card"}`}
      </button>
    </div>
  );
}
