import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { portfolio, type Holding } from "@/lib/portfolio";
import { moneyView, pocketOptions } from "@/lib/money-view";
import { requireUser } from "@/lib/session";
import { REWARD_TABLES } from "@/lib/sim-rewards";
import { simRewardsView } from "@/lib/sim-view";
import { fmt, LADDERS, type Rung } from "@/lib/tiers";
import { MAIN_TOKEN, WALLET_TOKENS } from "@/lib/tokens";
import { Skeleton } from "../../../ui/avatar";
import { CheckIcon, ChevronIcon, ExternalIcon, LockIcon, VaultIcon } from "../../../ui/icons";
import { Money } from "../../../ui/money-kit";
import Progress from "../../../ui/progress";
import TierList from "../../../ui/tier-list";
import SimRewardsPanel from "./sim-rewards-panel";
import { DOWN, fluid, pct, price, qty, short, UP, usd } from "@/lib/format";
import { Sparkline, TokenIcon } from "../../../ui/token-ui";

/** Every token in the registry has a page (known up front, so the route is fully prerenderable). */
export async function generateStaticParams() {
  return WALLET_TOKENS.map((t) => ({ code: t.code }));
}

export default function TokenPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <main className="relative flex flex-col gap-5 px-5 pt-[22px]">
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-[420px] w-[600px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 35%, rgba(123,63,255,0.32) 0%, rgba(7,6,11,0) 62%)" }}
      />
      <Link href="/wallet" className="press relative flex items-center gap-1 self-start text-xs font-bold text-muted">
        <ChevronIcon size={14} className="rotate-180" /> Wallet
      </Link>
      <Suspense
        fallback={
          <div className="flex flex-col gap-5">
            <Skeleton className="h-20" />
            <Skeleton className="h-[220px]" />
            <Skeleton className="h-[160px]" />
          </div>
        }
      >
        <Body params={params} />
      </Suspense>
    </main>
  );
}

async function Body({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!WALLET_TOKENS.some((t) => t.code === code)) notFound();
  const user = await requireUser();
  const data = await portfolio(user);
  const h = data.holdings.find((x) => x.code === code)!;
  const hidden = user.prefs.hideBalances;
  let rewards: React.ReactNode = null;
  if (REWARD_TABLES[code] && h.live) {
    const [sim, mv] = await Promise.all([simRewardsView(user, h, data.busy), moneyView(user)]);
    const cards = pocketOptions(mv.tr).filter((p) => p.value !== "main" && p.active);
    const ladder = LADDERS[code] ?? [];
    rewards = sim && (
      <SimRewardsPanel
        view={sim}
        ranges={Object.fromEntries(ladder.map((r) => [r.n, r.to === null ? `${fmt(r.from)}+ ${code}` : `${fmt(r.from)} – ${fmt(r.to)}`]))}
        cards={cards}
        defaultCard={cards.some((c) => c.value === mv.tr.defaultDestination) ? mv.tr.defaultDestination : null}
        hidden={hidden}
      />
    );
  }
  return <TokenView h={h} hidden={hidden} busy={data.busy} ladder={LADDERS[code] ?? null} rewards={rewards} />;
}

function TokenView({ h, hidden, busy, ladder, rewards }: { h: Holding; hidden: boolean; busy: boolean; ladder: Rung[] | null; rewards: React.ReactNode }) {
  const up = (h.change24h ?? 0) >= 0;
  const hi = h.spark.length ? Math.max(...h.spark) : null, lo = h.spark.length ? Math.min(...h.spark) : null;
  const isMain = h.code === MAIN_TOKEN.code;

  return (
    <div className="relative flex flex-col gap-5">
      <header className="flex items-center gap-4">
        <TokenIcon h={h} size={60} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className={`truncate font-display leading-tight font-extrabold ${h.name.length > 11 ? "text-[21px]" : "text-[min(26px,6.67vw)]"}`}>{h.name}</h1>
          <span className="text-xs font-bold text-muted">
            {h.code}
            {h.tier && h.tier.n > 0 ? ` · Tier ${h.tier.n}` : ""}
          </span>
        </div>
      </header>

      {!h.live ? (
        <p className="rounded-[20px] border border-white/10 bg-white/[0.035] p-5 text-sm text-muted-2">
          {h.name} is coming to XLM TREASURY. Once it launches, your balance, its price and its tiers show up here automatically.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <span className="eyebrow">YOU HOLD</span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="chrome font-display leading-none font-extrabold tabular-nums" style={{ fontSize: fluid(big(hidden ? "••••" : qty(h.amount))) }}>
                {hidden ? "••••" : qty(h.amount)}
              </span>
              <span className="font-sans text-sm font-extrabold text-muted">{h.code}</span>
            </span>
            <span className="text-sm text-muted-2 tabular-nums">{h.valueUsd !== null && !hidden ? `≈ ${usd(h.valueUsd)}` : h.priceUsd === null ? "No price yet" : ""}</span>
            {busy && <span className="mt-1 text-xs text-muted">Stellar is busy: showing your last known balance.</span>}
          </section>

          <section className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-display text-xl font-extrabold tabular-nums">{h.priceUsd !== null ? <Money text={price(h.priceUsd)} /> : "—"}</span>
              {h.change24h !== null && (
                <span className="text-sm font-extrabold tabular-nums" style={{ color: up ? UP : DOWN }}>
                  {pct(h.change24h)} <span className="text-xs text-muted">24h</span>
                </span>
              )}
            </div>
            {h.spark.length > 1 ? (
              <>
                <Sparkline data={h.spark} up={up} width="100%" height={130} area />
                <div className="flex justify-between text-[11px] font-bold text-dim tabular-nums">
                  <span>7d low {lo !== null ? price(lo) : ""}</span>
                  <span>7d high {hi !== null ? price(hi) : ""}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-dim">Not enough trades in the last 7 days for a chart.</p>
            )}
          </section>

          {h.tier && ladder && (
            <section className="flex flex-col gap-3 rounded-[22px] border border-violet-2/50 bg-linear-135 from-violet/30 to-violet/5 p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-2xl font-extrabold">{h.tier.n ? `Tier ${h.tier.n}` : "No tier yet"}</span>
                <span className="text-xs font-bold text-lilac-soft">of {h.tier.of}</span>
              </div>
              {h.tier.n < h.tier.of && (
                <>
                  <Progress value={h.tier.progress} label={`Progress to Tier ${h.tier.n + 1}`} />
                  <span className="text-xs font-bold text-lilac-soft tabular-nums">
                    {hidden ? "••" : fmt(h.tier.toNext)} more {h.code} to reach Tier {h.tier.n + 1}
                  </span>
                </>
              )}
            </section>
          )}

          {rewards}

          {isMain && (
            <Link href="/treasury" className="press flex items-center gap-3.5 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-on-paper">
                <VaultIcon size={18} />
              </span>
              <span className="flex grow flex-col">
                <span className="text-sm font-extrabold">Tier rewards & your vault</span>
                <span className="text-xs text-muted">Collect what your {h.code} has built up</span>
              </span>
              <ChevronIcon size={16} className="text-dim" />
            </Link>
          )}

          {h.perWallet.length > 0 && (
            <section className="flex flex-col gap-2">
              <span className="eyebrow">HELD IN</span>
              <ul className="flex flex-col rounded-[20px] border border-white/10 bg-white/[0.035]">
                {h.perWallet.map((w) => (
                  <li key={w.address} className="flex items-center justify-between gap-3 px-4 py-3 not-last:border-b not-last:border-white/[0.06]">
                    <span className="font-mono text-xs font-bold text-muted-2">{short(w.address)}</span>
                    <span className="text-sm font-extrabold tabular-nums">{hidden ? "••" : qty(w.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {ladder && (
        <section className="flex flex-col gap-2.5">
          <span className="eyebrow">{h.code} TIERS</span>
          {isMain ? <TierList current={h.tier?.n ?? 0} /> : <Ladder rungs={ladder} current={h.tier?.n ?? 0} />}
        </section>
      )}

      {h.issuer && (
        <section className="flex flex-col rounded-[20px] border border-white/10 bg-white/[0.035]">
          {h.homeDomain && (
            <a href={`https://${h.homeDomain}`} target="_blank" rel="noreferrer" className="press flex items-center justify-between px-4 py-3.5 text-sm font-bold">
              {h.homeDomain} <ExternalIcon />
            </a>
          )}
          <a
            href={`https://stellar.expert/explorer/public/asset/${h.code}-${h.issuer}`}
            target="_blank"
            rel="noreferrer"
            className="press flex items-center justify-between border-t border-white/[0.06] px-4 py-3.5 text-sm font-bold"
          >
            View on StellarExpert <ExternalIcon />
          </a>
          <span className="border-t border-white/[0.06] px-4 py-3 font-mono text-[11px] text-dim">Issuer {short(h.issuer)}</span>
        </section>
      )}
    </div>
  );
}

/** Display size that keeps long amounts on one line at phone width. */
const big = (text: string) => (text.length > 13 ? 24 : text.length > 10 ? 29 : 38);

/** A token's published tier ranges, with the member's own tier marked. */
function Ladder({ rungs, current }: { rungs: Rung[]; current: number }) {
  return (
    <ol className="flex flex-col gap-2">
      {[...rungs].reverse().map((r) => {
        const mine = r.n === current, locked = r.n > current;
        return (
          <li
            key={r.n}
            className={`flex items-center gap-3 rounded-[16px] border px-4 py-3 ${mine ? "border-violet-2 bg-violet/20" : locked ? "border-white/10 bg-white/4" : "border-white/8 bg-white/[0.025]"}`}
          >
            <span className={`w-12 font-display text-lg font-extrabold ${mine ? "text-white" : locked ? "chrome" : "text-dim"}`}>T{r.n}</span>
            <span className="grow text-sm font-extrabold tabular-nums">{r.to === null ? `${fmt(r.from)}+` : `${fmt(r.from)} – ${fmt(r.to)}`}</span>
            {mine ? (
              <span className="rounded-lg bg-paper px-2 py-0.5 text-[10px] font-extrabold tracking-[0.14em] text-violet-deep">YOU</span>
            ) : locked ? (
              <LockIcon className="text-dim" />
            ) : (
              <CheckIcon className="text-violet-2" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
