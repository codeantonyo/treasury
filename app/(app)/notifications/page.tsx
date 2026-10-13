import Link from "next/link";
import { Suspense } from "react";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Skeleton } from "../../ui/avatar";
import { ChevronIcon } from "../../ui/icons";

export default function Notifications() {
  return (
    <main className="flex flex-col gap-4 px-5 pt-[22px]">
      <Link href="/" className="flex items-center gap-1 self-start text-xs font-bold text-muted">
        <ChevronIcon size={14} className="rotate-180" /> Home
      </Link>
      <h1 className="chrome font-display text-[min(30px,7.69vw)] leading-none font-extrabold">Notifications</h1>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  const user = await requireUser();
  const items = (await db.find("notifications", "userId", user.id)).sort((a, b) => b.at - a.at).slice(0, 50);
  const unread = items.filter((n) => !n.read);
  if (unread.length)
    after(() =>
      db.tx(async (t) => {
        for (const n of unread) {
          const cur = await t.get("notifications", n.id);
          if (cur && !cur.read) await t.put("notifications", { ...cur, read: true });
        }
      }),
    );
  if (!items.length) return <p className="py-8 text-center text-sm text-dim">Nothing yet. Rewards and transfers show up here.</p>;
  return (
    <ul className="flex flex-col divide-y divide-white/6 rounded-[18px] border border-white/10 bg-white/4 px-3.5">
      {items.map((n) => (
        <li key={n.id} className="flex items-start gap-2.5 py-3">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-ember"}`} />
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold">{n.text}</span>
            <span className="text-[11px] text-dim">{new Date(n.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
