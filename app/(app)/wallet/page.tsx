import { Suspense } from "react";
import { redirect } from "next/navigation";
import { portfolio } from "@/lib/portfolio";
import { requireUser } from "@/lib/session";
import { Skeleton } from "../../ui/avatar";
import WalletScreen from "./wallet-screen";

export default function Wallet(props: PageProps<"/wallet">) {
  return (
    <main className="relative flex flex-col gap-5 px-5 pt-[22px]">
      <div
        className="pointer-events-none absolute -top-16 -right-24 h-[420px] w-[520px]"
        style={{ background: "radial-gradient(ellipse at 60% 35%, rgba(123,63,255,0.35) 0%, rgba(7,6,11,0) 62%)" }}
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="h-24 w-56" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-[360px] rounded-[22px]" />
          </div>
        }
      >
        <Body searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/wallet">["searchParams"] }) {
  const [{ asset }, user] = await Promise.all([searchParams, requireUser()]);
  if (typeof asset === "string") redirect(`/wallet/${encodeURIComponent(asset)}`); // older ?asset= links
  const data = await portfolio(user);
  return (
    <div className="relative">
      <WalletScreen data={data} hidden={user.prefs.hideBalances} />
    </div>
  );
}
