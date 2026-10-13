import Link from "next/link";
import { Suspense } from "react";
import { usd } from "@/lib/currencies";
import { db } from "@/lib/db";
import { tokenPriceXlm } from "@/lib/fx";
import { memberView } from "@/lib/member";
import { moneyView } from "@/lib/money-view";
import { requireUser } from "@/lib/session";
import { currentStreak, safeZone, streakStatus, TIER_BOOST } from "@/lib/streak";
import { fmt, tier, toNextTier } from "@/lib/tiers";
import { ECOSYSTEM_TOKENS, MAIN_TOKEN } from "@/lib/tokens";
import Avatar, { Skeleton } from "../ui/avatar";
import Greeting from "../ui/greeting";
import { BellIcon, ChevronIcon, ReceiveIcon, SendIcon, VaultIcon } from "../ui/icons";
import Orbit from "../ui/orbit";
import StreakCard from "../ui/streak-card";
import StreakPill from "../ui/streak-pill";

export default function Home() {
  return (
    <main className="relative">
      <div
        className="pointer-events-none absolute top-10 left-1/2 h-[520px] w-[630px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(123,63,255,0.55) 0%, rgba(74,28,160,0.28) 32%, rgba(7,6,11,0) 66%)" }}
      />
      <Suspense fallback={<Skeleton className="mx-5 mt-[18px] h-10" />}>
        <Header />
      </Suspense>
      <Orbit assets={ECOSYSTEM_TOKENS.map((t) => t.code)} />
      <section className="relative flex flex-col gap-4 px-5">
        <Suspense fallback={<Skeleton className="mx-auto h-[86px] w-64" />}>
          <Balance />
        </Suspense>
        <div className="grid grid-cols-3 gap-2.5">
          <button className="flex h-16 flex-col items-center justify-center gap-1 rounded-[18px] bg-paper text-[13px] font-extrabold text-on-paper transition-transform active:scale-[0.97]">
            <SendIcon />
            Send
          </button>
          <button className="flex h-16 flex-col items-center justify-center gap-1 rounded-[18px] border border-white/14 bg-white/5 text-[13px] font-extrabold transition-transform active:scale-[0.97]">
            <ReceiveIcon />
            Receive
          </button>
          <Link
            href="/treasury"
            className="flex h-16 flex-col items-center justify-center gap-1 rounded-[18px] border border-violet-2/50 bg-violet/18 text-[13px] font-extrabold text-lilac-soft transition-transform active:scale-[0.97]"
          >
            <VaultIcon size={18} />
            Treasury
          </Link>
        </div>
        <Suspense fallback={<Skeleton className="h-[86px]" />}>
          <InApp />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[250px]" />}>
          <Streak />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[68px]" />}>
          <TierCard />
        </Suspense>
      </section>
    </main>
  );
}

async function Header() {
  const user = await requireUser();
  const streak = currentStreak(user.streak, safeZone(user.timeZone));
  const unread = (await db.find("notifications", "userId", user.id)).filter((n) => !n.read).length;
  return (
    <header className="relative flex items-center justify-between px-5 pt-[18px]">
      <Link href="/profile" className="flex min-w-0 items-center gap-2.5">
        <Avatar src={user.avatar} name={user.name} />
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-muted">
            <Greeting />
          </span>
          <span className="truncate text-[15px] font-extrabold">@{user.tag}</span>
        </div>
      </Link>
      <div className="flex shrink-0 gap-2">
        <StreakPill count={streak} />
        <Link
          href="/notifications"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/6 transition-transform active:scale-95"
        >
          <BellIcon />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-ember" />}
        </Link>
      </div>
    </header>
  );
}


/** Wallet (on-chain, live). Never blended with in-app balances. */
async function Balance() {
  const user = await requireUser();
  const [v, mv, price] = await Promise.all([memberView(user), moneyView(user), tokenPriceXlm().catch(() => null)]);
  const value = v.xlm !== null && price !== null && mv.rates ? (v.xlm + v.holding * price) * mv.rates.USD : null;
  const hidden = user.prefs.hideBalances;
  const amount = hidden ? "••••••" : value !== null ? usd(value) : `${fmt(v.holding)} ${MAIN_TOKEN.code}`;
  const size = amount.length > 14 ? 26 : amount.length > 10 ? 34 : 44;
  return (
    <Link href="/wallet" className="press flex flex-col items-center gap-1">
      <span className="eyebrow">WALLET · ON-CHAIN</span>
      <span className="chrome max-w-full font-display leading-[1.1] font-extrabold tracking-[-0.01em] tabular-nums" style={{ fontSize: size }}>
        {amount}
      </span>
      <span className="text-center text-xs text-muted">
        {!v.verified.length ? (
          <span className="font-bold text-lilac">Link a Stellar wallet to see your balance</span>
        ) : v.stale ? (
          "Stellar is busy · showing your last balance"
        ) : (
          `Live from your wallets · ${v.assets} asset${v.assets === 1 ? "" : "s"}`
        )}
      </span>
    </Link>
  );
}

/** In-app balances: the XLM TREASURY Account and the cards, each labelled. */
async function InApp() {
  const user = await requireUser();
  const mv = await moneyView(user);
  const hidden = user.prefs.hideBalances;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Link href="/account" className="flex flex-col gap-1 rounded-[18px] border border-white/10 bg-white/4 p-3.5 transition-transform active:scale-[0.98]">
        <span className="text-[10px] font-extrabold tracking-[0.12em] text-muted">XLM TREASURY ACCOUNT</span>
        <span className="truncate font-display text-lg font-extrabold tabular-nums">{hidden ? "••••" : mv.main.display}</span>
        <span className="text-[11px] text-dim">{!hidden && mv.main.usd !== null ? `≈ ${usd(mv.main.usd)} · ` : ""}In-app balance</span>
      </Link>
      <Link href="/card" className="flex flex-col gap-1 rounded-[18px] border border-white/10 bg-white/4 p-3.5 transition-transform active:scale-[0.98]">
        <span className="text-[10px] font-extrabold tracking-[0.12em] text-muted">CARDS</span>
        <span className="truncate font-display text-lg font-extrabold tabular-nums">{hidden ? "••••" : mv.cardsUsd === null ? "—" : usd(mv.cardsUsd)}</span>
        <span className="text-[11px] text-dim">
          {mv.cards.length} card{mv.cards.length === 1 ? "" : "s"} · in-app
        </span>
      </Link>
    </div>
  );
}

/** Daily streak: collect in-app XLM each day while holding XLMTREASURY2 (tier boosts it). */
async function Streak() {
  const user = await requireUser();
  const v = await memberView(user);
  const s = streakStatus(user.streak, safeZone(user.timeZone), v.tier);
  const lock = !v.verified.length ? "wallet" : v.holding <= 0 ? "hold" : null;
  return <StreakCard {...s} boost={TIER_BOOST[v.tier]} tier={v.tier} lock={lock} />;
}

async function TierCard() {
  const user = await requireUser();
  const v = await memberView(user);
  const next = tier(v.tier + 1);
  return (
    <Link
      href="/wallet/XLMTREASURY2"
      className="flex items-center gap-3 rounded-[18px] border border-violet-2/40 bg-linear-to-r from-violet/28 to-violet/8 px-4 py-3.5 transition-transform active:scale-[0.98]"
    >
      <span className="font-display text-[22px] font-extrabold text-lilac">T{v.tier}</span>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-extrabold">{v.tier ? `Tier ${v.tier} · ${tier(v.tier)!.swapPct}% swap` : "No tier yet"}</span>
        <span className="truncate text-xs text-muted-2">
          {next ? `${fmt(toNextTier(v.holding))} more to Tier ${next.n}` : "Top tier reached"}
        </span>
      </div>
      <ChevronIcon className="shrink-0 text-lilac" />
    </Link>
  );
}
