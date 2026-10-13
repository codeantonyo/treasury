import { Suspense } from "react";
import { redirect } from "next/navigation";
import { memberView } from "@/lib/member";
import { designOptions, moneyView } from "@/lib/money-view";
import { requireUser } from "@/lib/session";
import { MAX_CARDS } from "@/lib/treasury";
import Journey from "./journey";

/** Card creation as a step-by-step journey (full screen, above the tab bar). */
export default function NewCard() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[60] bg-ink" />}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const user = await requireUser();
  const [mv, view] = await Promise.all([moneyView(user), memberView(user)]);
  if (mv.cards.length >= MAX_CARDS) redirect("/card");
  return <Journey designs={designOptions(Math.max(user.maxTier, view.tier))} rates={mv.rates} firstCard={mv.cards.length === 0} pending={mv.tr.pending.length} />;
}
