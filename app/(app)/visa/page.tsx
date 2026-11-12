import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { eligibility, memberOf } from "@/lib/visa/sync";
import { Skeleton } from "../../ui/avatar";
import { ChevronIcon } from "../../ui/icons";
import VisaSection from "./visa";

/** StellarPay Visa: the real card, on its own page, separate from the in-app cards. Limited by CARD_VISIBLE_TO. */
export default function VisaPage() {
  return (
    <main className="relative flex flex-col gap-5 px-5 pt-[22px]">
      <div
        className="pointer-events-none absolute -top-10 left-1/2 h-[440px] w-[600px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(123,63,255,0.42) 0%, rgba(74,28,160,0.18) 38%, rgba(7,6,11,0) 68%)" }}
      />
      <Link href="/" className="press relative flex items-center gap-1 self-start text-xs font-bold text-muted">
        <ChevronIcon size={14} className="rotate-180" /> Home
      </Link>
      <Suspense fallback={<Skeleton className="aspect-[1.586] w-full rounded-[22px]" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const user = await requireUser();
  const member = await memberOf(user.id);
  if (!member || !(await eligibility(member)).visible) notFound(); // their tier's wave isn't out yet
  return (
    <>
      <header className="relative flex flex-col gap-1">
        <h1 className="font-display text-[min(30px,7.69vw)] leading-tight font-extrabold">StellarPay Visa</h1>
        <p className="text-[13px] text-muted-2">A real Visa card, loaded by XLM TREASURY. Use it anywhere Visa works, online or with Apple Pay and Google Pay.</p>
      </header>
      <div className="relative">
        <VisaSection />
      </div>
    </>
  );
}
