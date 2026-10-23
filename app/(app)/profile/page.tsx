import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { memberView } from "@/lib/member";
import { BONUS_MULTIPLIER, MIN_PURCHASE_XLM } from "@/lib/referrals";
import { requireUser } from "@/lib/session";
import { currentStreak, safeZone, weekStrip } from "@/lib/streak";
import { fmt } from "@/lib/tiers";
import { BOT_USERNAME } from "@/lib/telegram";
import { MAIN_TOKEN } from "@/lib/tokens";
import Avatar, { Skeleton } from "../../ui/avatar";
import { CheckIcon, GearIcon } from "../../ui/icons";
import ShareButton from "./share-button";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_STYLE = {
  done: "bg-violet",
  today: "border border-paper text-paper",
  missed: "bg-white/4 text-dim",
  future: "border border-dashed border-white/25 text-dim",
} as const;

export default function Profile() {
  return (
    <main className="flex flex-col gap-[18px] px-5 pt-[22px]">
      <Suspense
        fallback={
          <>
            <Skeleton className="h-[72px]" />
            <Skeleton className="h-[100px]" />
            <Skeleton className="h-[260px]" />
          </>
        }
      >
        <Me />
      </Suspense>
    </main>
  );
}

async function Me() {
  const user = await requireUser();
  const v = await memberView(user);
  const tz = safeZone(user.timeZone);
  const streak = currentStreak(user.streak, tz);

  return (
    <>
      <header className="flex items-center gap-3.5">
        <span className="size-[72px] shrink-0 rounded-full bg-linear-135 from-violet to-paper p-[3px]">
          <Avatar src={user.avatar} name={user.name} size={66} />
        </span>
        <div className="flex min-w-0 grow flex-col gap-[3px]">
          <span className="chrome truncate font-display text-[22px] font-extrabold">{user.name}</span>
          <span className="truncate text-[13px] text-muted">
            @{user.tag} · {v.tier ? `Tier ${v.tier}` : "No tier yet"}
          </span>
        </div>
        <Link
          href="/profile/settings"
          aria-label="Settings"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/5 transition-transform active:scale-95"
        >
          <GearIcon />
        </Link>
      </header>

      {!user.emailVerified && (
        <Link href="/verify" className="rounded-[16px] border border-ember/40 bg-ember/10 px-4 py-3 text-[13px] font-bold text-ember">
          Verify your email to start earning referral rewards →
        </Link>
      )}

      <section className="flex flex-col gap-2.5 rounded-[20px] border border-white/10 bg-white/4 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold tabular-nums">
            Daily streak · {streak} day{streak === 1 ? "" : "s"}
          </span>
          <span className="text-xs font-bold text-ember">{streak ? "Don't break it" : "Collect on Home"}</span>
        </div>
        <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
          {weekStrip(user.streak, tz).map((s, i) => (
            <li
              key={i}
              aria-label={`${DAYS[i]}: ${s}`}
              className={`flex h-[34px] items-center justify-center rounded-[10px] text-[11px] font-extrabold ${DAY_STYLE[s]}`}
            >
              {DAYS[i]}
            </li>
          ))}
        </ol>
      </section>

      <Suspense fallback={<Skeleton className="h-[260px]" />}>
        <Referrals userId={user.id} code={user.referralCode} qualified={user.qualifiedReferrals} />
      </Suspense>
    </>
  );
}

async function Referrals({ userId, code, qualified }: { userId: string; code: string; qualified: number }) {
  const [refs, payouts] = await Promise.all([db.find("referrals", "referrerId", userId), db.find("payouts", "userId", userId)]);
  const friends = await Promise.all(
    refs.map(async (r) => {
      const [u, wallets] = await Promise.all([db.get("users", r.id), db.find("wallets", "userId", r.id)]);
      const waiting =
        r.status === "qualified" ? null
        : r.status === "rejected" ? "Doesn't count"
        : !u?.emailVerified ? "Needs to verify email"
        : !wallets.some((w) => w.status === "verified") ? "Needs to link a wallet"
        : `Needs a first buy worth ${MIN_PURCHASE_XLM}+ XLM`;
      const payout = payouts.find((p) => p.id === `ref:${r.id}`);
      return { r, name: u?.name ?? "Member", tag: u?.tag ?? "", waiting, payout };
    }),
  );
  friends.sort((a, b) => b.r.createdAt - a.r.createdAt);
  const paid = payouts.filter((p) => p.status === "sent").reduce((s, p) => s + p.amount, 0);
  const owed = payouts.filter((p) => p.status !== "sent").reduce((s, p) => s + p.amount, 0);
  const link = `https://t.me/${BOT_USERNAME}?start=${code}`; // the bot's Open button carries the code to /register

  return (
    <section className="flex flex-col gap-4 rounded-[20px] border border-violet-2/40 bg-linear-135 from-violet/30 to-violet/8 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-extrabold">Invite friends</span>
          <span className="text-xs text-lilac-soft">
            You <b className="text-paper">both</b> get <b className="text-paper">{BONUS_MULTIPLIER * 100}%</b> of your friend&apos;s first purchase
          </span>
        </div>
        <span className="font-display text-2xl font-extrabold tabular-nums">{qualified}</span>
      </div>

      <ol className="grid grid-cols-2 gap-1.5" aria-label="Examples">
        {[500, 250].map((buy) => (
          <li key={buy} className="flex flex-col items-center gap-0.5 rounded-xl bg-black/30 py-2">
            <span className="text-[10px] font-extrabold tracking-[0.1em] text-muted">FRIEND BUYS {fmt(buy)}</span>
            <span className="text-sm font-extrabold tabular-nums">+{fmt(buy * BONUS_MULTIPLIER)} each</span>
          </li>
        ))}
      </ol>

      <div className="flex gap-2.5">
        <span className="flex h-12 min-w-0 grow items-center rounded-[14px] bg-black/35 px-3.5 text-sm font-extrabold tracking-[0.1em] select-all">{code}</span>
        <ShareButton link={link} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-black/25 py-2">
          <div className="text-[10px] font-extrabold tracking-[0.12em] text-muted">EARNED</div>
          <div className="text-sm font-extrabold tabular-nums">{fmt(paid)}</div>
        </div>
        <div className="rounded-xl bg-black/25 py-2">
          <div className="text-[10px] font-extrabold tracking-[0.12em] text-muted">ON THE WAY</div>
          <div className="text-sm font-extrabold tabular-nums">{fmt(owed)}</div>
        </div>
      </div>

      {friends.length > 0 && (
        <ul className="flex flex-col divide-y divide-white/8">
          {friends.map(({ r, name, tag, waiting, payout }) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-bold">{name}</span>
                <span className="truncate text-[11px] text-muted">@{tag}</span>
              </div>
              {waiting ? (
                <span className="shrink-0 text-[11px] font-bold text-muted-2">{waiting}</span>
              ) : payout?.status === "sent" && payout.txHash ? (
                <a
                  href={`https://stellar.expert/explorer/public/tx/${payout.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-lilac-soft tabular-nums"
                >
                  <CheckIcon size={14} />+{fmt(r.amount ?? 0)} paid
                </a>
              ) : (
                <span className="flex min-w-0 shrink flex-col items-end text-right">
                  <span className="text-xs font-extrabold text-lilac-soft tabular-nums">+{fmt(r.amount ?? 0)} on the way</span>
                  {payout?.error && <span className="text-[10.5px] text-muted">{payout.error.startsWith("{") ? "Retrying" : payout.error[0].toUpperCase() + payout.error.slice(1)}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-snug text-muted-2">
        Your friend signs up with your code, verifies their email, links a Stellar wallet, then makes their first {MAIN_TOKEN.code} purchase on the Stellar DEX
        (worth at least {MIN_PURCHASE_XLM} XLM). You both get {BONUS_MULTIPLIER * 100}% of what they bought, once per friend, sent to your primary wallets in {MAIN_TOKEN.code} 7 days later
        while they still hold it. Wallets need the {MAIN_TOKEN.code} trustline.
      </p>
    </section>
  );
}
