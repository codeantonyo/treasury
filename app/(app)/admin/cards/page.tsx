import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isTester } from "@/lib/visa/sync";
import { Skeleton } from "../../../ui/avatar";
import CardsConsole from "./console";

/** StellarPay Visa operator console. Admins only. */
export default function AdminCardsPage() {
  return (
    <main className="flex flex-col gap-4 px-5 pt-[22px]">
      <h1 className="font-display text-[min(26px,6.67vw)] font-extrabold">StellarPay Visa · admin</h1>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const user = await requireUser();
  if (user.role !== "admin" && !isTester(user)) notFound();
  return <CardsConsole />;
}
