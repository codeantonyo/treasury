"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatMoney, usd } from "@/lib/currencies";
import type { ActivityRow } from "@/lib/money-view";
import { closeCard, editCard, freezeCard, setRewardDestination, unfreezeCard, type MoneyResult } from "../actions";
import { CARDS } from "@/lib/cards";
import CardFace, { CardBack, EngravedMark } from "../../ui/card-face";
import { CardIcon, CheckIcon, CopyIcon, DotsIcon, GiftIcon, LockIcon, PencilIcon, PlusIcon, SendIcon, SnowIcon, StarIcon, SwapIcon, XIcon } from "../../ui/icons";
import {
  Activity,
  ActionRow,
  Chip,
  dangerBtn,
  ErrorLine,
  longDate,
  MenuRow,
  Money,
  n7,
  primaryBtn,
  quietBtn,
  SendSheet,
  TransferSheet,
  useMoney,
  type PocketData,
} from "../../ui/money-kit";
import Sheet from "../../ui/sheet";

export type CardData = {
  id: string;
  name: string;
  design: string;
  currency: string;
  balance: string; // units
  display: string;
  usd: number | null;
  status: string;
  frozenUntil: number | null;
  isDefault: boolean;
  details: { number: string; last4: string; expiry: string; cvv: string };
};
export type { PocketData };
export type DesignData = { id: string; name: string; thumb: string; minTier: number; unlocked: boolean };

type SheetKind = "topup" | "move" | "send" | "more" | null;

const PEEK = 40; // how much of each card behind shows above the front card
const FREEZE_DAYS = 30;

export default function CardsScreen({
  cards,
  pockets,
  designs,
  rates,
  rows,
  hidden,
  canAdd,
  initialId,
  openTopUp,
  heldUsd,
  tag,
}: {
  cards: CardData[];
  pockets: PocketData[];
  designs: DesignData[];
  rates: Record<string, number> | null;
  rows: ActivityRow[];
  hidden: boolean;
  canAdd: boolean;
  initialId: string | null;
  openTopUp: boolean;
  heldUsd: number | null;
  tag: string;
}) {
  // Open on: the card asked for, else the one rewards land on, else the first active one.
  const [sel, setSel] = useState(() => {
    const pick = [cards.findIndex((c) => c.id === initialId), cards.findIndex((c) => c.isDefault), cards.findIndex((c) => c.status === "active")].find((i) => i >= 0);
    return pick ?? 0;
  });
  const [sheet, setSheet] = useState<SheetKind>(openTopUp && cards.length ? "topup" : null);
  // Opened from "Top up now": drop ?do=topup so a refresh doesn't reopen the sheet.
  useEffect(() => {
    if (openTopUp) window.history.replaceState(null, "", initialId ? `/card?card=${initialId}` : "/card");
  }, [openTopUp, initialId]);
  const [flipped, setFlipped] = useState<string | null>(null); // id of the card showing its back
  const card = cards[Math.min(sel, cards.length - 1)];

  if (!card) return <EmptyState tag={tag} />;
  const here = `card:${card.id}`;
  const frozen = card.status === "frozen";
  const names = new Map(pockets.map((p) => [p.value, p.label]));
  const mine: PocketData = { value: here, label: `${card.name} card`, currency: card.currency, units: card.balance, active: !frozen };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">HELD ACROSS YOUR CARDS</span>
          <span className="chrome font-display text-[min(34px,8.72vw)] leading-none font-extrabold tabular-nums">
            {hidden ? "••••" : heldUsd === null ? "—" : <Money text={usd(heldUsd)} />}
          </span>
          <span className="text-[11px] text-dim">
            {cards.length} of 3 cards · in-app balances, not payment cards
          </span>
        </div>
        {canAdd && (
          <Link
            href="/card/new"
            aria-label="Create a new card"
            className="press flex size-12 shrink-0 items-center justify-center rounded-full bg-paper text-on-paper shadow-[0_8px_30px_rgba(244,242,250,0.18)]"
          >
            <PlusIcon size={22} />
          </Link>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <CardStack cards={cards} sel={sel} onSelect={setSel} hidden={hidden} flipped={flipped} onFlip={(id) => setFlipped((f) => (f === id ? null : id))} />
        <span className="-mt-1 text-center text-[11px] text-dim">{flipped === card.id ? "Tap the card to flip it back" : "Tap the card for its number"}</span>
        {cards.length > 1 && (
          <div className="flex justify-center gap-1.5" role="tablist" aria-label="Cards">
            {cards.map((c, i) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={i === sel}
                aria-label={c.name}
                onClick={() => setSel(i)}
                className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ease-snappy ${i === sel ? "w-5 bg-paper" : "w-1.5 bg-white/25"}`}
              />
            ))}
          </div>
        )}
      </div>

      <ActionRow
        actions={[
          { key: "topup", label: "Top up", icon: <PlusIcon size={20} />, primary: true, disabled: frozen, onClick: () => setSheet("topup") },
          { key: "move", label: "Move", icon: <SwapIcon size={20} />, disabled: frozen, onClick: () => setSheet("move") },
          { key: "send", label: "Send", icon: <SendIcon size={20} />, disabled: frozen, onClick: () => setSheet("send") },
          { key: "more", label: "More", icon: <DotsIcon />, onClick: () => setSheet("more") },
        ]}
      />

      <div className="-mt-1 flex flex-wrap justify-center gap-2">
        {frozen && card.frozenUntil && <Chip icon={<SnowIcon size={12} />}>Frozen until {longDate(card.frozenUntil)}</Chip>}
        {card.isDefault && <Chip icon={<StarIcon size={12} />}>Rewards land here</Chip>}
        {rates && <Chip>{rateLine(card.currency, rates)}</Chip>}
      </div>

      <Activity rows={rows} pocket={here} names={names} />

      <Sheet open={sheet === "topup"} onClose={() => setSheet(null)} title={`Top up ${card.name}`}>
        <TransferSheet key={`in${here}`} mode="in" fixed={mine} pockets={pockets} rates={rates} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "move"} onClose={() => setSheet(null)} title={`Move from ${card.name}`}>
        <TransferSheet key={`out${here}`} mode="out" fixed={mine} pockets={pockets} rates={rates} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "send"} onClose={() => setSheet(null)} title="Send to a member">
        <SendSheet key={`send${here}`} from={mine} rates={rates} onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title={card.name}>
        <MoreSheet key={`more${here}${card.status}${card.isDefault}`} card={card} designs={designs} rates={rates} onDone={() => setSheet(null)} />
      </Sheet>
    </div>
  );
}

const rateLine = (currency: string, rates: Record<string, number>) => `1 XLM ≈ ${currency === "XLM" ? usd(rates.USD) : formatMoney(rates[currency], currency)}`;

/** Cards stacked like a wallet: the selected one in front, the others peeking above it. */
function CardStack({
  cards,
  sel,
  onSelect,
  hidden,
  flipped,
  onFlip,
}: {
  cards: CardData[];
  sel: number;
  onSelect: (i: number) => void;
  hidden: boolean;
  flipped: string | null;
  onFlip: (id: string) => void;
}) {
  const n = cards.length;
  return (
    <div className="relative" style={{ paddingTop: (n - 1) * PEEK }}>
      <div className="invisible aspect-[1.586] w-full" aria-hidden="true" />
      {cards.map((c, i) => {
        const depth = (i - sel + n) % n; // 0 = front
        const face = <CardFace {...c} usdValue={c.usd} hidden={hidden} last4={c.details.last4} />;
        return (
          <motion.div
            key={c.id}
            className="absolute inset-x-0"
            style={{ top: (n - 1) * PEEK, zIndex: n - depth, transformOrigin: "50% 0%" }}
            initial={false}
            animate={{ y: -depth * PEEK, scale: 1 - depth * 0.05 }}
            transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
            drag={depth === 0 && n > 1 ? "x" : false}
            dragSnapToOrigin
            dragElastic={0.4}
            onTap={() => depth === 0 && onFlip(c.id)}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70 || info.velocity.x < -400) onSelect((sel + 1) % n);
              else if (info.offset.x > 70 || info.velocity.x > 400) onSelect((sel - 1 + n) % n);
            }}
          >
            {depth === 0 ? (
              <div className="perspective-[1400px]" role="button" aria-label={flipped === c.id ? "Show front of card" : "Show card number, expiry and CVV"}>
                <motion.div className="relative transform-3d" animate={{ rotateY: flipped === c.id ? 180 : 0 }} transition={{ type: "spring", duration: 0.55, bounce: 0.12 }}>
                  <div className="backface-hidden">{face}</div>
                  <div className="absolute inset-0 rotate-y-180 backface-hidden">
                    <CardBack design={c.design} {...c.details} hidden={hidden} />
                  </div>
                </motion.div>
              </div>
            ) : (
              <button onClick={() => onSelect(i)} aria-label={`Show ${c.name} card`} className="relative block w-full text-left">
                {face}
                <span className="pointer-events-none absolute inset-0 rounded-[22px] bg-black" style={{ opacity: 0.12 * depth }} />
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function MoreSheet({ card, designs, rates, onDone }: { card: CardData; designs: DesignData[]; rates: Record<string, number> | null; onDone: () => void }) {
  const [view, setView] = useState<"menu" | "edit" | "freeze" | "close" | "details">("menu");
  const [name, setName] = useState(card.name);
  const [design, setDesign] = useState(card.design);
  const [unfreezeFrom] = useState(() => Date.now() + FREEZE_DAYS * 86_400_000);
  const m = useMoney();
  const here = `card:${card.id}`;
  const frozen = card.status === "frozen";
  const bal = n7(card.balance);
  const asXlm = rates ? (bal * rates.XLM) / rates[card.currency] : null;

  if (view === "details") return <CardDetails card={card} onBack={() => setView("menu")} />;

  if (view === "edit")
    return (
      <div className="flex flex-col gap-4 pb-1">
        <div className="mx-auto w-[78%]">
          <CardFace design={design} name={name} currency={card.currency} display={card.display} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-muted-2">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            className="h-13 rounded-[16px] border border-white/12 bg-white/[0.05] px-4 text-base font-bold outline-none focus:border-violet-2"
          />
        </label>
        <FinishPicker designs={designs} value={design} onChange={setDesign} />
        <ErrorLine res={m.res} />
        <button disabled={!name.trim() || m.pending} onClick={() => m.run(() => editCard(card.id, name, design), (r) => r.ok && onDone())} className={primaryBtn}>
          {m.pending ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setView("menu")} className={quietBtn}>
          Back
        </button>
      </div>
    );

  if (view === "freeze")
    return (
      <Confirm
        icon={<SnowIcon size={30} />}
        title={`Freeze ${card.name}?`}
        points={["It can't send or receive money.", "Rewards meant for it go to your main account.", `You can unfreeze it from ${longDate(unfreezeFrom)}.`]}
        action="Freeze for 30 days"
        pending={m.pending}
        res={m.res}
        onConfirm={() => m.run(() => freezeCard(card.id), (r) => r.ok && onDone())}
        onBack={() => setView("menu")}
      />
    );

  if (view === "close")
    return (
      <Confirm
        icon={<XIcon size={30} />}
        danger
        title={`Close ${card.name}?`}
        points={
          frozen
            ? ["Frozen cards can't send money, so this card can't be closed until you unfreeze it."]
            : [
                bal > 0
                  ? `Its ${formatMoney(bal, card.currency)} moves to your main account${asXlm !== null && card.currency !== "XLM" ? ` as ≈ ${formatMoney(asXlm, "XLM")}` : ""}.`
                  : "It has no balance to move.",
                "Then the card closes for good. Its history stays in your activity.",
              ]
        }
        action={`Close ${card.name}`}
        disabled={frozen}
        pending={m.pending}
        res={m.res}
        onConfirm={() => m.run((key) => closeCard(card.id, key), (r) => r.ok && onDone())}
        onBack={() => setView("menu")}
      />
    );

  return (
    <div className="flex flex-col gap-2 pb-1">
      <MenuRow icon={<CardIcon size={18} />} title="Card details" sub={`Number, expiry and CVV · •••• ${card.details.last4}`} onClick={() => setView("details")} />
      <MenuRow icon={<PencilIcon />} title="Name & finish" sub="Rename it or pick another finish" onClick={() => setView("edit")} />
      <MenuRow
        icon={<StarIcon size={18} />}
        title="Rewards land here"
        sub={card.isDefault ? "Rewards go to this card first" : "Send your rewards to this card"}
        toggle={card.isDefault}
        disabled={frozen || m.pending}
        onClick={() => m.run(() => setRewardDestination(card.isDefault ? "main" : here), (r) => r.ok && onDone())}
      />
      {frozen ? (
        <MenuRow
          icon={<SnowIcon />}
          title="Unfreeze"
          sub={card.frozenUntil ? `Available from ${longDate(card.frozenUntil)}` : "Unfreeze this card"}
          disabled={m.pending}
          onClick={() => m.run(() => unfreezeCard(card.id), (r) => r.ok && onDone())}
        />
      ) : (
        <MenuRow icon={<SnowIcon />} title="Freeze card" sub="Pause it for at least 30 days" onClick={() => setView("freeze")} />
      )}
      <MenuRow icon={<XIcon size={18} />} title="Close card" sub="Move its balance home and close it" danger onClick={() => setView("close")} />
      <ErrorLine res={m.res} />
    </div>
  );
}

/** Number, expiry and CVV, hidden until "Show", each with a copy button. */
function CardDetails({ card, onBack }: { card: CardData; onBack: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value.replace(/ /g, ""));
    setCopied(label);
    setTimeout(() => setCopied(null), 1400);
  };
  const rows: [string, string][] = [
    ["Card number", card.details.number],
    ["Valid thru", card.details.expiry],
    ["CVV", card.details.cvv],
  ];
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="mx-auto w-[86%]">
        <CardBack design={card.design} {...card.details} hidden={!shown} />
      </div>
      <ul className="flex flex-col rounded-[20px] border border-white/10 bg-white/[0.035]">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center gap-3 px-4 py-3 not-last:border-b not-last:border-white/[0.06]">
            <span className="flex min-w-0 grow flex-col">
              <span className="text-[11px] font-bold text-muted">{label}</span>
              <span className="truncate text-[15px] font-extrabold tracking-[0.08em] tabular-nums">{shown ? value : value.replace(/\d/g, "•")}</span>
            </span>
            <button
              disabled={!shown}
              onClick={() => copy(label, value)}
              aria-label={`Copy ${label.toLowerCase()}`}
              className="press flex h-9 shrink-0 items-center gap-1 rounded-xl border border-white/14 px-3 text-xs font-extrabold disabled:opacity-35"
            >
              {copied === label ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied === label ? "Copied" : "Copy"}
            </button>
          </li>
        ))}
      </ul>
      
      <button onClick={() => setShown((v) => !v)} className={primaryBtn}>
        {shown ? "Hide details" : "Show details"}
      </button>
      <button onClick={onBack} className={quietBtn}>
        Back
      </button>
    </div>
  );
}

function Confirm({
  icon,
  title,
  points,
  action,
  onConfirm,
  onBack,
  pending,
  res,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  points: string[];
  action: string;
  onConfirm: () => void;
  onBack: () => void;
  pending: boolean;
  res?: MoneyResult;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <span className={`flex size-[72px] items-center justify-center rounded-full ${danger ? "bg-red-500/12 text-red-300" : "bg-[#cfe0ff]/12 text-[#dbe7ff]"}`}>{icon}</span>
        <h3 className="font-display text-2xl font-extrabold">{title}</h3>
      </div>
      <ul className="flex flex-col gap-2 rounded-[18px] bg-white/[0.04] p-4">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm text-muted-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lilac" />
            {p}
          </li>
        ))}
      </ul>
      <ErrorLine res={res} />
      <button
        disabled={pending || disabled}
        onClick={onConfirm}
        className={danger ? dangerBtn : primaryBtn}
      >
        {pending ? "Working…" : action}
      </button>
      <button onClick={onBack} className={quietBtn}>
        Back
      </button>
    </div>
  );
}

export function FinishPicker({ designs, value, onChange }: { designs: DesignData[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {designs.map((d) => (
        <button
          key={d.id}
          type="button"
          disabled={!d.unlocked}
          onClick={() => onChange(d.id)}
          aria-pressed={value === d.id}
          className="press flex flex-col items-center gap-1.5 disabled:cursor-not-allowed"
        >
          <span
            className={`flex aspect-[1.586] w-full items-center justify-center rounded-[10px] transition-[outline-color] duration-150 ${
              value === d.id ? "outline-2 outline-offset-[3px] outline-paper" : "outline-transparent"
            } ${d.unlocked ? "" : "opacity-40"}`}
            style={{ background: d.thumb }}
          >
            {!d.unlocked && <LockIcon size={14} className="text-paper" />}
          </span>
          <span className={`text-[11px] font-bold ${value === d.id ? "text-paper" : "text-muted"}`}>{d.unlocked ? d.name : `Tier ${d.minTier}`}</span>
        </button>
      ))}
    </div>
  );
}

/** No cards yet: a demo card with the member's @tag, the other finishes peeking out behind it. */
function EmptyState({ tag }: { tag: string }) {
  return (
    <div className="flex flex-col items-center gap-7 text-center">
      <span className="eyebrow self-start">CARDS</span>
      <div className="relative -mt-2 h-[226px] w-full max-w-[320px]" aria-hidden="true">
        {[
          { id: "obsidian", style: "translateY(0px) scale(0.86) rotate(5deg)" },
          { id: "silver", style: "translateY(16px) scale(0.93) rotate(-3.5deg)" },
        ].map((c) => {
          const d = CARDS.find((x) => x.id === c.id)!;
          return (
            <div
              key={c.id}
              className="absolute inset-x-[6%] top-0 aspect-[1.586] overflow-hidden rounded-[22px]"
              style={{ transform: c.style, background: d.card, boxShadow: `inset 0 0 0 1px ${d.border}, 0 18px 40px rgba(0,0,0,0.45)` }}
            >
              <EngravedMark className="absolute top-[52%] right-[6%] h-[62%] -translate-y-1/2" />
            </div>
          );
        })}
        <motion.div
          className="absolute inset-x-[6%] top-[38px]"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <CardFace design="violet" name={`@${tag}`} display="€250.00" currency="EUR" last4="2026" />
          <span className="absolute right-[16px] bottom-[18px] rounded-full border border-white/30 bg-black/30 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.2em] text-paper">
            DEMO
          </span>
        </motion.div>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[min(26px,6.67vw)] leading-tight font-extrabold">Make your first card</h2>
        <p className="mx-auto max-w-[300px] text-sm text-muted-2">Cards are in-app pockets with their own currency. Keep money for a trip, a goal or your rewards apart.</p>
      </div>
      <ul className="flex w-full flex-col gap-2 text-left">
        {[
          ["8 currencies", "Euro, dollar, pound, yen, XLM and more", <span key="c" className="font-sans text-sm font-extrabold">€$</span>],
          ["Rewards land here", "Tier rewards and airdrops are paid to a card", <GiftIcon key="g" size={18} />],
          ["Freeze anytime", "Pause a card when you don't need it", <SnowIcon key="s" />],
        ].map(([t, s, ic]) => (
          <li key={t as string} className="flex items-center gap-3.5 rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-lilac">{ic}</span>
            <span className="flex flex-col">
              <span className="text-sm font-extrabold">{t}</span>
              <span className="text-xs text-muted">{s}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link href="/card/new" className={primaryBtn}>
        Create a card
      </Link>
    </div>
  );
}

