"use client";

import Link from "next/link";
import { useState } from "react";
import { usd } from "@/lib/currencies";
import type { ActivityRow } from "@/lib/money-view";
import { setRewardDestination } from "../actions";
import CardFace, { EngravedMark } from "../../ui/card-face";
import { CardIcon, CheckIcon, CopyIcon, PlusIcon, ReceiveIcon, SendIcon, ShareIcon, StarIcon } from "../../ui/icons";
import { Activity, ActionRow, Chip, ErrorLine, primaryBtn, SendSheet, TransferSheet, useMoney, type PocketData } from "../../ui/money-kit";
import Sheet from "../../ui/sheet";

type MiniCard = { id: string; name: string; design: string; currency: string; display: string; exact: string; status: string; isDefault: boolean; last4: string };
type SheetKind = "tocard" | "send" | "receive" | "rewards" | null;

export default function AccountScreen({
  tag,
  mainDisplay,
  mainUsd,
  pockets,
  cards,
  rates,
  rows,
  defaultDestination,
  hidden,
  canAddCard,
}: {
  tag: string;
  mainDisplay: string;
  mainUsd: number | null;
  pockets: PocketData[];
  cards: MiniCard[];
  rates: Record<string, number> | null;
  rows: ActivityRow[];
  defaultDestination: string;
  hidden: boolean;
  canAddCard: boolean;
}) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const main = pockets.find((p) => p.value === "main")!;
  const hasCard = pockets.some((p) => p.value !== "main" && p.active);
  const names = new Map(pockets.map((p) => [p.value, p.label]));
  const close = () => setSheet(null);
  const [amount, unit] = mainDisplay.split(" ");

  return (
    <div className="flex flex-col gap-6">
      <section
        className="relative overflow-hidden rounded-[28px] border border-white/10 px-6 pt-6 pb-5"
        style={{ background: "linear-gradient(140deg, #22154a 0%, #2c1870 42%, #140d28 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 60px rgba(0,0,0,0.45)" }}
      >
        <span className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(160,107,255,0.35), transparent 65%)" }} />
        <EngravedMark className="pointer-events-none absolute top-1/2 -right-8 h-[118%] -translate-y-1/2" depth={1.15} />
        <div className="relative flex flex-col gap-1">
          <span className="eyebrow">XLM TREASURY ACCOUNT</span>
          <span className="chrome mt-1 font-display text-[40px] leading-none font-extrabold tabular-nums">
            {hidden ? "••••" : amount}
            {!hidden && <span className="ml-1.5 text-[0.45em] text-muted">{unit}</span>}
          </span>
          {mainUsd !== null && <span className="text-sm text-muted-2 tabular-nums">≈ {hidden ? "••" : usd(mainUsd)}</span>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip>In-app balance · not on-chain</Chip>
            {defaultDestination === "main" && <Chip icon={<StarIcon size={12} />}>Rewards land here</Chip>}
          </div>
        </div>
      </section>

      <ActionRow
        actions={[
          { key: "tocard", label: "To card", icon: <CardIcon />, primary: true, onClick: () => setSheet("tocard") },
          { key: "send", label: "Send", icon: <SendIcon size={20} />, onClick: () => setSheet("send") },
          { key: "receive", label: "Receive", icon: <ReceiveIcon size={20} />, onClick: () => setSheet("receive") },
          { key: "rewards", label: "Rewards", icon: <StarIcon size={20} />, onClick: () => setSheet("rewards") },
        ]}
      />

      {rates && (
        <div className="-mt-1 flex justify-center">
          <Chip>1 XLM ≈ {usd(rates.USD)}</Chip>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">YOUR CARDS</span>
          <Link href="/card" className="text-xs font-bold text-lilac">
            Open cards
          </Link>
        </div>
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
          {cards.map((c) => (
            <Link key={c.id} href={`/card?card=${c.id}`} className="press relative aspect-[1.586] w-[156px] shrink-0 overflow-hidden rounded-[11px]" aria-label={`${c.name} card`}>
              {/* a full-size card at half scale, so it looks exactly like the real one */}
              <div className="pointer-events-none absolute top-0 left-0 w-[312px] origin-top-left scale-50">
                <CardFace design={c.design} name={c.name} currency={c.currency} display={c.display} exact={c.exact} status={c.status} isDefault={c.isDefault} hidden={hidden} last4={c.last4} />
              </div>
            </Link>
          ))}
          {canAddCard && (
            <Link
              href="/card/new"
              className="press flex aspect-[1.586] w-[156px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-white/20 text-muted-2"
            >
              <PlusIcon />
              <span className="text-xs font-extrabold">New card</span>
            </Link>
          )}
        </div>
      </section>

      <Activity
        rows={rows}
        names={names}
        filters={[{ value: "main", label: "Account" }, ...pockets.filter((p) => p.value !== "main").map((p) => ({ value: p.value, label: p.label.replace(/ card$/, "") }))]}
      />

      <Sheet open={sheet === "tocard"} onClose={close} title="Move to a card">
        {hasCard ? (
          <TransferSheet mode="out" fixed={main} pockets={pockets} rates={rates} onDone={close} />
        ) : (
          <NoCard />
        )}
      </Sheet>
      <Sheet open={sheet === "send"} onClose={close} title="Send to a member">
        <SendSheet from={main} rates={rates} onDone={close} />
      </Sheet>
      <Sheet open={sheet === "receive"} onClose={close} title="Receive">
        <ReceiveSheet tag={tag} />
      </Sheet>
      <Sheet open={sheet === "rewards"} onClose={close} title="Send my rewards to">
        <RewardsSheet key={defaultDestination} options={pockets} value={defaultDestination} onDone={close} />
      </Sheet>
    </div>
  );
}

function NoCard() {
  return (
    <div className="flex flex-col items-center gap-3 pt-2 pb-2 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-white/[0.07] text-lilac">
        <CardIcon size={26} />
      </span>
      <p className="max-w-[280px] text-sm text-muted-2">You don&apos;t have an active card yet. Create one, then move money onto it.</p>
      <Link href="/card/new" className={`${primaryBtn} mt-2`}>
        Create a card
      </Link>
    </div>
  );
}

function ReceiveSheet({ tag }: { tag: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = `Send me XLM on XLM TREASURY: @${tag}`;
    if (navigator.share) return navigator.share({ text }).catch(() => {});
    await navigator.clipboard.writeText(`@${tag}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="flex flex-col items-center gap-4 pt-2 pb-1 text-center">
      <p className="text-sm text-muted-2">Members send to your username. It arrives here, in your main account, in XLM.</p>
      <div className="flex w-full flex-col items-center gap-1 rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-6">
        <span className="eyebrow">YOUR USERNAME</span>
        <span className="chrome font-display text-[34px] leading-tight font-extrabold break-all">@{tag}</span>
      </div>
      <div className="grid w-full grid-cols-2 gap-2.5">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(`@${tag}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="press flex h-14 items-center justify-center gap-2 rounded-[18px] border border-white/14 bg-white/[0.06] text-sm font-extrabold"
        >
          {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />} {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={share} className="press flex h-14 items-center justify-center gap-2 rounded-[18px] bg-paper text-sm font-extrabold text-on-paper">
          <ShareIcon size={16} /> Share
        </button>
      </div>
      <p className="text-[11px] text-dim">In-app transfers only. To receive tokens on Stellar, use your own wallet address.</p>
    </div>
  );
}

function RewardsSheet({ options, value, onDone }: { options: PocketData[]; value: string; onDone: () => void }) {
  const [pick, setPick] = useState(value);
  const m = useMoney();
  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-sm text-muted-2">Rewards, airdrops and admin credits land here automatically. Tier rewards and airdrops always go to a card.</p>
      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Rewards destination">
        {options
          .filter((o) => o.active)
          .map((o) => {
            const on = pick === o.value;
            return (
              <li key={o.value}>
                <button
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPick(o.value)}
                  className={`press flex w-full items-center gap-3.5 rounded-[18px] border px-4 py-3.5 text-left ${on ? "border-paper/80 bg-white/[0.1]" : "border-white/[0.08] bg-white/[0.035]"}`}
                >
                  <span className="flex min-w-0 grow flex-col">
                    <span className="text-sm font-extrabold">{o.label}</span>
                    <span className="text-[11px] text-muted">{o.value === "main" ? "XLM · in-app account" : `${o.currency} card`}</span>
                  </span>
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${on ? "border-paper bg-paper text-on-paper" : "border-white/25"}`}>
                    {on && <CheckIcon size={14} />}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
      <ErrorLine res={m.res} />
      <button disabled={pick === value || m.pending} onClick={() => m.run(() => setRewardDestination(pick), (r) => r.ok && onDone())} className={primaryBtn}>
        {m.pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
