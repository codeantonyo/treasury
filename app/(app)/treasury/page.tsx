import Link from "next/link";
import { Suspense } from "react";
import { shortNum } from "@/lib/currencies";
import { db, type User } from "@/lib/db";
import { tokenPriceXlm } from "@/lib/fx";
import { memberView } from "@/lib/member";
import { pocketOptions } from "@/lib/money-view";
import { ensureTreasury, readyToCollect, TIER_RATE_PER_DAY, touchAccrual } from "@/lib/treasury";
import { requireUser } from "@/lib/session";
import { firstBuy } from "@/lib/stellar";
import { ALLOCATION_ASSETS, daysSince, fmt, tier, tierProgress, toNextTier } from "@/lib/tiers";
import { MAIN_TOKEN } from "@/lib/tokens";
import { Skeleton } from "../../ui/avatar";
import { CalendarIcon, ExternalIcon, GiftIcon, SwapIcon, WalletIcon } from "../../ui/icons";
import { CollectButton } from "../../ui/money";
import SwapMeter from "../../ui/swap-meter";
import VaultDial from "../../ui/vault-dial";

export default function Treasury() {
  return (
    <main className="relative flex flex-col gap-5 px-5 pt-[22px]">
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-[460px] w-[620px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(123,63,255,0.4) 0%, rgba(74,28,160,0.18) 38%, rgba(7,6,11,0) 68%)" }}
      />
      <div className="relative flex flex-col gap-1.5">
        <span className="eyebrow">TREASURY</span>
        <h1 className="chrome font-display text-[min(30px,7.69vw)] leading-[1.05] font-extrabold">Your vault</h1>
      </div>
      <Suspense
        fallback={
          <>
            <Skeleton className="mx-auto aspect-square w-full max-w-[300px] rounded-full" />
            <Skeleton className="h-40" />
          </>
        }
      >
        <Vault />
      </Suspense>
    </main>
  );
}

async function Vault() {
  const user = await requireUser();
  const v = await memberView(user);
  const t = tier(v.tier), next = tier(v.tier + 1);
  const hidden = user.prefs.hideBalances;

  return (
    <>
      <div className="relative flex flex-col items-center gap-3">
        <VaultDial tier={v.tier} progress={tierProgress(v.holding)} amount={hidden ? "••••" : fmt(v.holding)} code={MAIN_TOKEN.code} />
        <p className="text-center text-sm font-bold text-muted-2 tabular-nums">
          {next ? (
            <>
              <span className="text-paper">{fmt(toNextTier(v.holding))}</span> more to reach Tier {next.n}
            </>
          ) : (
            "You've reached the top tier."
          )}
        </p>
        {v.stale && (
          <p className="rounded-xl bg-white/6 px-3 py-2 text-center text-xs text-muted-2">
            Stellar is busy right now. This is your last known balance{v.asOf ? ` from ${new Date(v.asOf).toLocaleString("en-GB")}` : ""}. Pull to refresh in a moment.
          </p>
        )}
      </div>

      {!v.verified.length ? (
        <section className="relative flex flex-col items-center gap-3 rounded-[20px] border border-violet-2/40 bg-linear-135 from-violet/30 to-violet/8 p-5 text-center">
          <WalletIcon className="text-lilac" />
          <p className="text-[15px] font-extrabold">Link your Stellar wallet to open your vault</p>
          <p className="text-xs leading-snug text-muted-2">
            We read your {MAIN_TOKEN.code} straight from Stellar. Link up to 3 wallets; your keys never leave your wallet.
          </p>
          <Link href="/profile/settings#wallets" className="mt-1 flex h-11 items-center rounded-[14px] bg-paper px-5 text-sm font-extrabold text-on-paper">
            Link a wallet
          </Link>
        </section>
      ) : (
        <Suspense fallback={<Skeleton className="h-[188px]" />}>
          <Stats user={user} addresses={v.verified.map((w) => w.address)} holding={v.holding} stale={v.stale} linkedAt={v.linkedAt} />
        </Suspense>
      )}

      <section className="relative grid grid-cols-2 gap-2.5">
        <Stat icon={<SwapIcon size={16} />} label="Swap">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-xl font-extrabold tabular-nums">{t?.swapPct ?? 0}%</span>
            <SwapMeter pct={t?.swapPct ?? 0} size={36} />
          </div>
          <span className="text-xs text-muted-2">of Stellar assets</span>
        </Stat>
        <Link href="/profile/settings#wallets" className="contents">
          <Stat icon={<WalletIcon size={16} />} label="Wallets">
            <span className="font-display text-xl font-extrabold tabular-nums">{v.verified.length} / 3</span>
            <span className="text-xs text-muted-2">verified · manage</span>
          </Stat>
        </Link>
      </section>

      <section className="relative flex flex-col gap-3 rounded-[20px] border border-white/10 bg-white/4 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-extrabold">{t ? `Tier ${t.n} allocation` : "Allocation"}</span>
          {next && <span className="text-[11px] font-bold text-muted">Tier {next.n} →</span>}
        </div>
        <ul className="flex flex-col divide-y divide-white/6">
          {ALLOCATION_ASSETS.map((a, i) => (
            <li key={a} className="flex items-center justify-between py-2">
              <span className="text-[13px] font-semibold text-muted-2">{a}</span>
              <span className="flex items-baseline gap-3 tabular-nums">
                <span className="text-sm font-extrabold">{t ? fmt(t.allocation[i]) : "0"}</span>
                {next && <span className="w-14 text-right text-xs font-bold text-dim">{fmt(next.allocation[i])}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-dim">Grows with every tier. More on allocations soon.</p>
      </section>

      <a
        href={`https://stellar.expert/explorer/public/asset/${MAIN_TOKEN.code}-${MAIN_TOKEN.issuer}`}
        target="_blank"
        rel="noreferrer"
        className="relative flex items-center justify-center gap-1.5 text-xs font-bold text-muted"
      >
        {MAIN_TOKEN.code} on StellarExpert <ExternalIcon />
      </a>
    </>
  );
}

async function Stats({ user, holding, stale, linkedAt, addresses }: { user: User; holding: number; stale: boolean; linkedAt: number | null; addresses: string[] }) {
  // Running accrual: moved forward and saved on every read (only with a fresh holding).
  const tr = await ensureTreasury(db, user.id);
  const acc = stale ? tr.accruals.tier : await touchAccrual(db, user.id, "tier", holding, linkedAt);
  const ready = readyToCollect(acc);
  const [price, since] = await Promise.all([tokenPriceXlm().catch(() => null), firstBuy(addresses).catch(() => null)]);
  const options = pocketOptions(tr).filter((o) => o.value !== "main"); // tier rewards land on a card
  const def = options.find((o) => o.value === tr.defaultDestination && o.active)?.value ?? options.find((o) => o.active)?.value ?? null;
  const hidden = user.prefs.hideBalances;
  const date = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const n = (u: bigint) => shortNum(Number(u) / 1e7, 4);

  return (
    <section className="relative grid grid-cols-2 gap-2.5">
      <Stat icon={<GiftIcon size={16} />} label="Tier rewards" wide>
        <span className="font-display text-[min(26px,6.67vw)] leading-tight font-extrabold text-lilac-soft tabular-nums">{hidden ? "••••" : `+${n(ready)}`}</span>
        <span className="text-xs text-muted-2">
          {MAIN_TOKEN.code} ready to collect{price && !hidden ? ` · ≈ ${n((ready * BigInt(Math.round(price * 1e9))) / 1_000_000_000n)} XLM` : ""}
        </span>
        <span className="text-[11px] text-dim">
          {linkedAt ? `Building up since ${date(linkedAt)} · ${TIER_RATE_PER_DAY * 100}% of your holding a day · paid to a card in XLM` : "Starts when you verify a wallet"}
        </span>
        <div className="mt-2">
          <CollectButton cards={options} defaultDest={def} disabled={stale || ready <= 0n} />
        </div>
      </Stat>
      <Stat icon={<CalendarIcon size={16} />} label="Holding since" wide>
        <span className="font-display text-xl font-extrabold tabular-nums">{since ? date(since) : "—"}</span>
        <span className="text-xs text-muted-2">{since ? `${fmt(daysSince(since))} days since your first buy` : "No DEX buy found for your wallets yet"}</span>
      </Stat>
    </section>
  );
}

function Stat({ icon, label, children, wide }: { icon: React.ReactNode; label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-[18px] border border-white/10 bg-white/4 p-3.5 ${wide ? "col-span-2" : ""}`}>
      <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.12em] text-muted uppercase">
        <span className="text-lilac">{icon}</span>
        {label}
      </span>
      {children}
    </div>
  );
}
