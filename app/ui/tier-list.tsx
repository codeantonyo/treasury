import { ALLOCATION_ASSETS, fmt, TIERS, type Tier } from "@/lib/tiers";
import { MAIN_TOKEN } from "@/lib/tokens";
import { CheckIcon, ChevronIcon, LockIcon } from "./icons";
import SwapMeter from "./swap-meter";

/** The 12-tier ladder: each row opens to show its swap share and asset allocation. */
export function range(t: Tier) {
  return t.to === null ? `${fmt(t.from)}+` : `${fmt(t.from)} – ${fmt(t.to)}`;
}

export default function TierList({ current }: { current: number }) {
  return (
    <ol className="relative flex flex-col gap-2">
      {[...TIERS].reverse().map((t) => {
        const mine = t.n === current;
        const locked = current >= 0 && t.n > current;
        return (
          <li key={t.n}>
            <details
              open={mine}
              className={`group rounded-[18px] border ${
                mine ? "border-violet-2 bg-violet/20" : locked ? "border-white/10 bg-white/4" : "border-white/8 bg-white/[0.025]"
              }`}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className={`w-12 font-display text-xl font-extrabold ${mine ? "text-white" : locked ? "chrome" : "text-dim"}`}>T{t.n}</span>
                <div className="flex grow flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums">
                    {range(t)}
                    {mine && <span className="rounded-lg bg-paper px-2 py-0.5 text-[10px] tracking-[0.14em] text-violet-deep">YOU</span>}
                  </span>
                  <span className="text-xs text-muted tabular-nums">{t.swapPct}% of Stellar assets for swap</span>
                </div>
                {current >= 0 &&
                  (locked ? <LockIcon className="text-dim" /> : !mine && <CheckIcon className="text-violet-2" />)}
                <ChevronIcon size={16} className="text-muted transition-transform group-open:rotate-90" />
              </summary>
              <div className="flex flex-col gap-3 px-4 pt-1 pb-4">
                <div className="flex items-center gap-3">
                  <SwapMeter pct={t.swapPct} />
                  <p className="text-xs leading-snug text-muted-2">
                    Holding {range(t)} {MAIN_TOKEN.code} makes <b className="text-paper">{t.swapPct}%</b> of Stellar assets available for swap.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {ALLOCATION_ASSETS.map((a, i) => (
                    <div key={a} className={`flex items-center justify-between rounded-xl bg-black/25 px-3 py-2 ${i === 0 ? "col-span-2" : ""}`}>
                      <span className="text-[11px] font-bold text-muted-2">{a}</span>
                      <span className="text-sm font-extrabold tabular-nums">{fmt(t.allocation[i])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
