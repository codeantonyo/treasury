import Link from "next/link";
import { Suspense } from "react";
import { activity, moneyView, pocketOptions } from "@/lib/money-view";
import { requireUser } from "@/lib/session";
import { MAX_CARDS } from "@/lib/treasury";
import { Skeleton } from "../../ui/avatar";
import { ChevronIcon } from "../../ui/icons";
import AccountScreen from "./account-screen";

export default function Account() {
  return (
    <main className="relative flex flex-col gap-4 px-5 pt-[22px]">
      <div
        className="pointer-events-none absolute -top-10 left-1/2 h-[440px] w-[620px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(123,63,255,0.35) 0%, rgba(7,6,11,0) 65%)" }}
      />
      <Link href="/" className="press relative flex items-center gap-1 self-start text-xs font-bold text-muted">
        <ChevronIcon size={14} className="rotate-180" /> Home
      </Link>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="h-[190px] rounded-[28px]" />
            <Skeleton className="h-20" />
          </div>
        }
      >
        <Body />
      </Suspense>
    </main>
  );
}

async function Body() {
  const user = await requireUser();
  const mv = await moneyView(user);
  const rows = await activity(user, mv.tr, 100);
  return (
    <div className="relative">
      <AccountScreen
        tag={user.tag}
        mainDisplay={mv.main.display}
        mainUsd={mv.main.usd}
        pockets={pocketOptions(mv.tr)}
        cards={mv.cards.map((c) => ({ id: c.id, name: c.name, design: c.design, currency: c.currency, display: c.display, exact: c.exact, status: c.status, isDefault: mv.tr.defaultDestination === `card:${c.id}`, last4: c.details.last4 }))}
        rates={mv.rates}
        rows={rows}
        defaultDestination={mv.tr.defaultDestination}
        hidden={user.prefs.hideBalances}
        canAddCard={mv.cards.length < MAX_CARDS}
      />
    </div>
  );
}
