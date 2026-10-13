"use client";

import Link from "next/link";
import type { Holding } from "@/lib/portfolio";
import { StarIcon, WalletIcon } from "../../ui/icons";
import { Money } from "../../ui/money-kit";
import { DOWN, pct, price, qty, short, UP, usd } from "@/lib/format";
import { Sparkline, TokenIcon } from "../../ui/token-ui";

type Data = {
  holdings: Holding[];
  total: number | null;
  change24h: number | null;
  changePct: number | null;
  wallets: { address: string; primary: boolean }[];
  busy: boolean;
  asOf: number | null;
};

export default function WalletScreen({ data, hidden }: { data: Data; hidden: boolean }) {
  const up = (data.change24h ?? 0) >= 0;
  const priced = data.holdings.filter((h) => (h.valueUsd ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <span className="eyebrow">WALLET · ON-CHAIN</span>
        <span className="chrome font-display text-[40px] leading-none font-extrabold tabular-nums">
          {hidden ? "••••••" : data.total === null ? "—" : <Money text={usd(data.total)} />}
        </span>
        <span className="flex items-center gap-2 text-sm font-bold tabular-nums">
          {data.change24h !== null && data.changePct !== null && !hidden ? (
            <>
              <span style={{ color: up ? UP : DOWN }}>
                {up ? "▲" : "▼"} {usd(Math.abs(data.change24h))} ({pct(data.changePct)})
              </span>
              <span className="text-muted">24h</span>
            </>
          ) : (
            <span className="text-muted">{data.wallets.length ? "Live from Stellar" : "Link a wallet to see your portfolio"}</span>
          )}
        </span>
        {data.busy && (
          <p className="mt-2 rounded-xl bg-white/[0.06] px-3 py-2 text-xs text-muted-2">
            Stellar is busy. Showing your last known balances{data.asOf ? ` from ${new Date(data.asOf).toLocaleString("en-GB")}` : ""}.
          </p>
        )}
      </header>

      {priced.length > 0 && data.total ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full" role="img" aria-label="Allocation by value">
            {priced.map((h) => (
              <span key={h.code} className="h-full rounded-full" style={{ width: `${((h.valueUsd ?? 0) / data.total!) * 100}%`, background: h.color, minWidth: 6 }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {priced.map((h) => (
              <span key={h.code} className="flex items-center gap-1.5 text-[11px] font-bold text-muted-2">
                <span className="size-2 rounded-full" style={{ background: h.color }} />
                {h.code} <span className="text-dim tabular-nums">{(((h.valueUsd ?? 0) / data.total!) * 100).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {data.wallets.length ? (
        <div className="-mx-5 flex items-center gap-2 overflow-x-auto px-5">
          {data.wallets.map((w) => (
            <span key={w.address} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] font-bold text-muted-2">
              {w.primary && <StarIcon size={11} className="text-lilac" />}
              {short(w.address)}
            </span>
          ))}
          <Link href="/profile/settings#wallets" className="press shrink-0 px-2 text-[11px] font-extrabold text-lilac">
            Manage
          </Link>
        </div>
      ) : (
        <Link href="/profile/settings#wallets" className="press flex items-center gap-3.5 rounded-[20px] border border-violet-2/40 bg-linear-135 from-violet/25 to-violet/5 p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-paper text-on-paper">
            <WalletIcon />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-extrabold">Link a Stellar wallet</span>
            <span className="text-xs text-muted-2">Your balances are read straight from Stellar. Up to 3 wallets.</span>
          </span>
        </Link>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">ASSETS</span>
          <span className="text-[11px] font-bold text-dim">Price · 7d</span>
        </div>
        <ul className="flex flex-col rounded-[22px] border border-white/10 bg-white/[0.035]">
          {data.holdings.map((h) => (
            <li key={h.code} className="not-last:border-b not-last:border-white/[0.06]">
              <Link href={`/wallet/${h.code}`} className="press flex w-full items-center gap-2.5 px-3.5 py-3.5 text-left">
                <TokenIcon h={h} size={40} />
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className={`truncate text-[15px] font-extrabold ${h.live ? "" : "text-muted-2"}`}>{h.name}</span>
                    {h.tier && h.tier.n > 0 && <span className="shrink-0 rounded-md bg-violet/25 px-1.5 py-0.5 text-[10px] font-extrabold text-lilac-soft">T{h.tier.n}</span>}
                  </span>
                  <span className="truncate text-xs text-muted tabular-nums">
                    {!h.live ? (
                      "Coming soon"
                    ) : h.priceUsd !== null ? (
                      <>
                        {price(h.priceUsd)}
                        {h.change24h !== null && <span style={{ color: h.change24h >= 0 ? UP : DOWN }}> {pct(h.change24h)}</span>}
                      </>
                    ) : (
                      "Price unavailable"
                    )}
                  </span>
                </span>
                {h.live && <Sparkline data={h.spark} up={(h.change24h ?? 0) >= 0} width={44} height={24} />}
                <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  {h.live ? (
                    <>
                      <span className="text-[15px] font-extrabold tabular-nums">{hidden ? "••••" : h.valueUsd !== null ? usd(h.valueUsd) : "—"}</span>
                      <span className="text-[11px] text-dim tabular-nums">{hidden ? "••" : qty(h.amount)}</span>
                    </>
                  ) : (
                    <span className="rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[10px] font-extrabold tracking-[0.1em] text-dim">SOON</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="px-1 text-[11px] leading-snug text-dim">On-chain balances from your verified wallets, priced live in USD. In-app balances (account and cards) are separate.</p>
      </section>

    </div>
  );
}
