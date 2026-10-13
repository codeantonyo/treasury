import Link from "next/link";
import { Suspense } from "react";
import { MAX_WALLETS } from "@/lib/account";
import { db } from "@/lib/db";
import { pocketOptions } from "@/lib/money-view";
import { ensureTreasury } from "@/lib/treasury";
import { DestinationSelect } from "../../../ui/money";
import { requireUser } from "@/lib/session";
import { logout, logoutEverywhere } from "../../../(auth)/actions";
import { Skeleton } from "../../../ui/avatar";
import { Submit } from "../../../ui/form";
import { ChevronIcon } from "../../../ui/icons";
import { AddWalletForm, AvatarPicker, EmailChange, PasswordForm, ProfileForm, Toggle, WalletRow } from "./client";

export default function Settings() {
  return (
    <main className="flex flex-col gap-4 px-5 pt-[22px]">
      <Link href="/profile" className="flex items-center gap-1 self-start text-xs font-bold text-muted">
        <ChevronIcon size={14} className="rotate-180" /> Profile
      </Link>
      <h1 className="chrome font-display text-[30px] leading-none font-extrabold">Settings</h1>
      <Suspense fallback={<Skeleton className="h-[480px]" />}>
        <Sections />
      </Suspense>
    </main>
  );
}

function Card({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3 rounded-[20px] border border-white/10 bg-white/4 p-4">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

async function Sections() {
  const user = await requireUser();
  const wallets = (await db.find("wallets", "userId", user.id)).sort((a, b) => a.createdAt - b.createdAt);
  const dev = process.env.NODE_ENV === "development" && !process.env.POSTGRES_URL;
  const tr = await ensureTreasury(db, user.id);

  return (
    <>
      <Card title="PROFILE">
        <AvatarPicker src={user.avatar} name={user.name} />
        <ProfileForm name={user.name} tag={user.tag} />
      </Card>

      <Card id="wallets" title={`STELLAR WALLETS · ${wallets.length}/${MAX_WALLETS}`}>
        <p className="text-xs leading-snug text-muted-2">
          Link up to {MAX_WALLETS} wallets (public G… addresses). Your balance and tier count every verified wallet. We never ask for your secret key.
        </p>
        {wallets.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {wallets.map((w) => (
              <WalletRow
                key={w.id}
                w={{ id: w.id, address: w.address, primary: w.primary, status: w.status, memo: w.memo, memoAt: w.memoAt }}
                treasury={process.env.TREASURY_ADDRESS ?? null}
                dev={dev}
              />
            ))}
          </ul>
        )}
        {wallets.length < MAX_WALLETS && (
          <AddWalletForm />
        )}
      </Card>

      <Card title="EMAIL">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-bold">{user.email}</span>
          {user.emailVerified ? (
            <span className="shrink-0 text-[11px] font-extrabold tracking-[0.1em] text-lilac">VERIFIED</span>
          ) : (
            <Link href="/verify" className="shrink-0 text-xs font-extrabold text-ember">
              Verify now →
            </Link>
          )}
        </div>
        <EmailChange />
      </Card>

      <Card title="PASSWORD">
        <PasswordForm />
      </Card>

      <Card title="REWARDS">
        <p className="text-xs leading-snug text-muted-2">
          Send my rewards to. Tier rewards and airdrops always go to a card. If the card you pick is frozen or closed, money goes to your main
          account (card-only rewards to your first active card).
        </p>
        <DestinationSelect options={pocketOptions(tr)} value={tr.defaultDestination} />
      </Card>

      <Card title="PREFERENCES">
        <div className="flex flex-col divide-y divide-white/8">
          <Toggle pref="hideBalances" label="Hide balances" hint="Show •••• instead of amounts, for screenshots and public places." initial={user.prefs.hideBalances} />
          <Toggle pref="emailNotifs" label="Email updates" hint="Referral rewards and tier changes." initial={user.prefs.emailNotifs} />
          <Toggle pref="tgNotifs" label="Telegram messages" hint="From the XLM TREASURY bot, once Telegram is connected." initial={user.prefs.tgNotifs} />
        </div>
      </Card>

      <Card title="SECURITY">
        <form action={logoutEverywhere}>
          <Submit variant="ghost" className="w-full">
            Sign out on all other devices
          </Submit>
        </form>
        <form action={logout}>
          <Submit variant="danger" className="w-full">
            Sign out
          </Submit>
        </form>
      </Card>

      <p className="pb-2 text-center text-[11px] text-dim">
        Member since {new Date(user.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · XLM TREASURY v0.1
      </p>
    </>
  );
}
