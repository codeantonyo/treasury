import { Suspense } from "react";
import { memberView } from "@/lib/member";
import { activity, designOptions, moneyView, pocketOptions } from "@/lib/money-view";
import { requireUser } from "@/lib/session";
import { MAX_CARDS } from "@/lib/treasury";
import { Skeleton } from "../../ui/avatar";
import CardsScreen from "./cards-screen";

export default function Cards(props: PageProps<"/card">) {
  return (
    <main className="relative flex flex-col gap-5 px-5 pt-[22px]">
      <div
        className="pointer-events-none absolute top-24 left-1/2 h-[420px] w-[560px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse, rgba(123,63,255,0.38) 0%, rgba(7,6,11,0) 62%)" }}
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="h-16 w-48" />
            <Skeleton className="aspect-[1.586] w-full rounded-[22px]" />
            <Skeleton className="h-20" />
          </div>
        }
      >
        <Body searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/card">["searchParams"] }) {
  const [{ card, do: action }, user] = await Promise.all([searchParams, requireUser()]);
  const [mv, view] = await Promise.all([moneyView(user), memberView(user)]);
  const rows = await activity(user, mv.tr, 100);
  return (
    <div className="relative">
      <CardsScreen
        cards={mv.cards.map((c) => ({ ...c, isDefault: mv.tr.defaultDestination === `card:${c.id}` }))}
        pockets={pocketOptions(mv.tr)}
        designs={designOptions(Math.max(user.maxTier, view.tier))}
        rates={mv.rates}
        rows={rows}
        hidden={user.prefs.hideBalances}
        canAdd={mv.cards.length < MAX_CARDS}
        initialId={typeof card === "string" ? card : null}
        openTopUp={action === "topup"}
        heldUsd={mv.cardsUsd}
        tag={user.tag}
      />
    </div>
  );
}
