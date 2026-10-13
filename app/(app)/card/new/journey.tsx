"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CARDS } from "@/lib/cards";
import { CURRENCY_INFO, formatMoney } from "@/lib/currencies";
import { createCard } from "../../actions";
import CardFace from "../../../ui/card-face";
import { CartIcon, CheckIcon, ChevronIcon, GiftIcon, HeartIcon, LockIcon, PlaneIcon, SparkleIcon, StarIcon, VaultIcon, XIcon, XlmMark } from "../../../ui/icons";
import type { DesignData } from "../cards-screen";

const PURPOSES = [
  { id: "travel", label: "Travel", sub: "Trips & holidays", Icon: PlaneIcon },
  { id: "savings", label: "Savings", sub: "Set money aside", Icon: VaultIcon },
  { id: "spending", label: "Spending", sub: "Everyday money", Icon: CartIcon },
  { id: "rewards", label: "Rewards", sub: "Collect what you earn", Icon: GiftIcon },
  { id: "family", label: "Family", sub: "For people you love", Icon: HeartIcon },
  { id: "other", label: "Something else", sub: "Name it yourself", Icon: SparkleIcon },
] as const;

const STEPS = [
  { title: "What's this card for?", sub: "Give it a job. You can rename it any time." },
  { title: "Pick its currency", sub: "The card holds its balance in this currency." },
  { title: "Choose a finish", sub: "Higher tiers unlock rarer finishes." },
  { title: "Ready to create", sub: "Check the details. You can change the name and finish later." },
];

const CURRENCIES = ["USD", "EUR", "GBP", "XLM", "CHF", "CAD", "AUD", "JPY"];
const ease = [0.23, 1, 0.32, 1] as const;

export default function Journey({ designs, rates, firstCard, pending }: { designs: DesignData[]; rates: Record<string, number> | null; firstCard: boolean; pending: number }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [design, setDesign] = useState(designs.find((d) => d.unlocked)?.id ?? "silver");
  const [makeDefault, setMakeDefault] = useState(firstCard);
  const [lockedHint, setLockedHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID()); // same key on retry: same card, never two
  const [busy, start] = useTransition();

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setError(null);
    setStep(to);
  };
  const pick = (id: string) => {
    const prev = PURPOSES.find((p) => p.id === purpose);
    const next = PURPOSES.find((p) => p.id === id)!;
    if (!name.trim() || name === prev?.label) setName(next.id === "other" ? "" : next.label);
    if (id === "rewards") setMakeDefault(true);
    setPurpose(id);
  };
  const create = () =>
    start(async () => {
      const r = await createCard(name, design, currency, key, makeDefault);
      if (r.error) return setError(r.error);
      setCreatedId(r.id ?? null);
      setDir(1);
      setStep(4);
    });

  const canNext = [!!name.trim(), !!currency, !!design, true][step];
  const done = step === 4;
  const tilt = [-4, 2, -2, 0, 0][step];

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-ink">
      <div
        className="pointer-events-none fixed top-0 left-1/2 h-[480px] w-[640px] -translate-x-1/2"
        style={{ background: `radial-gradient(ellipse at 50% 35%, ${glow(design)} 0%, rgba(7,6,11,0) 62%)` }}
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[calc(120px+env(safe-area-inset-bottom))]">
        {!done && (
          <div className="flex items-center gap-4">
            <Link href="/card" aria-label="Cancel" className="press flex size-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06]">
              <XIcon size={18} />
            </Link>
            <div className="flex grow gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label="Progress">
              {STEPS.map((_, i) => (
                <span key={i} className="h-1 grow overflow-hidden rounded-full bg-white/12">
                  <span
                    className="block h-full origin-left rounded-full bg-paper transition-transform duration-300 ease-snappy"
                    style={{ transform: `scaleX(${i <= step ? 1 : 0})` }}
                  />
                </span>
              ))}
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-bold text-muted tabular-nums">{step + 1}/4</span>
          </div>
        )}

        {/* the card being made */}
        <div className="relative mx-auto mt-7 w-full max-w-[300px]">
          <motion.div className="relative" animate={{ rotate: tilt, y: done ? 34 : 0, scale: done ? 1.1 : 1 }} transition={{ type: "spring", duration: 0.6, bounce: 0.25 }}>
            <CardFace design={design} name={name || "Your card"} currency={currency} display={formatMoney(0, currency)} isDefault={makeDefault} />
            {done && (
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-[22px] border-2 border-lilac"
                initial={{ opacity: 0.8, scale: 1 }}
                animate={{ opacity: 0, scale: 1.16 }}
                transition={{ duration: 0.9, ease, delay: 0.15 }}
              />
            )}
          </motion.div>
        </div>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -28 }}
            transition={{ duration: 0.22, ease }}
            className={`${done ? "mt-20" : "mt-8"} flex flex-col gap-5`}
          >
            {done ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <h1 className="chrome font-display text-[30px] leading-tight font-extrabold">{name} is ready</h1>
                <p className="max-w-[300px] text-sm text-muted-2">
                  Your new {CURRENCY_INFO[currency].name} card is in your wallet.
                  {pending ? ` ${pending} waiting reward${pending > 1 ? "s" : ""} just landed on it.` : makeDefault ? " Your rewards will land here." : ""}
                </p>
                <div className="mt-4 flex w-full flex-col gap-2">
                  <button onClick={() => router.push(`/card?card=${createdId}&do=topup`)} className={primary}>
                    Top up now
                  </button>
                  <button onClick={() => router.push(`/card?card=${createdId}`)} className={quiet}>
                    Go to my cards
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <h1 className="font-display text-[26px] leading-tight font-extrabold">{STEPS[step].title}</h1>
                  <p className="text-sm text-muted-2">{STEPS[step].sub}</p>
                </div>

                {step === 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      {PURPOSES.map(({ id, label, sub, Icon }) => (
                        <button
                          key={id}
                          onClick={() => pick(id)}
                          aria-pressed={purpose === id}
                          className={`press flex flex-col items-start gap-2.5 rounded-[20px] border p-3.5 text-left transition-[background-color,border-color] duration-150 ${
                            purpose === id ? "border-paper/80 bg-white/[0.1]" : "border-white/[0.08] bg-white/[0.035]"
                          }`}
                        >
                          <span className={`flex size-10 items-center justify-center rounded-full ${purpose === id ? "bg-paper text-on-paper" : "bg-white/[0.07] text-lilac"}`}>
                            <Icon size={20} />
                          </span>
                          <span className="flex flex-col">
                            <span className="text-sm font-extrabold">{label}</span>
                            <span className="text-[11px] text-muted">{sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <label className="flex flex-col gap-2">
                      <span className="flex justify-between text-xs font-bold text-muted-2">
                        Card name <span className="tabular-nums text-dim">{name.length}/24</span>
                      </span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={24}
                        placeholder="e.g. Summer in Lisbon"
                        className="h-14 rounded-[18px] border border-white/12 bg-white/[0.05] px-4 text-base font-bold outline-none placeholder:font-semibold placeholder:text-dim focus:border-violet-2"
                      />
                    </label>
                  </>
                )}

                {step === 1 && (
                  <>
                    <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Currency">
                      {CURRENCIES.map((c) => {
                        const on = currency === c;
                        const info = CURRENCY_INFO[c];
                        return (
                          <li key={c}>
                            <button
                              role="radio"
                              aria-checked={on}
                              onClick={() => setCurrency(c)}
                              className={`press flex w-full items-center gap-3.5 rounded-[18px] border px-4 py-3 text-left transition-[background-color,border-color] duration-150 ${
                                on ? "border-paper/80 bg-white/[0.1]" : "border-white/[0.08] bg-white/[0.035]"
                              }`}
                            >
                              <span className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.08] font-sans font-extrabold ${info.symbol.length > 1 ? "text-[11px]" : "text-lg"}`}>
                                {c === "XLM" ? <XlmMark size={18} /> : info.symbol}
                              </span>
                              <span className="flex min-w-0 grow flex-col">
                                <span className="text-sm font-extrabold">{info.name}</span>
                                <span className="text-[11px] text-muted tabular-nums">
                                  {c}
                                  {rates && c !== "XLM" ? ` · 1 XLM ≈ ${formatMoney(rates[c], c)}` : ""}
                                </span>
                              </span>
                              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${on ? "border-paper bg-paper text-on-paper" : "border-white/25"}`}>
                                {on && <CheckIcon size={14} />}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <LockIcon size={13} /> A card&apos;s currency can&apos;t be changed later.
                    </p>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {designs.map((d) => {
                        const on = design === d.id;
                        const meta = CARDS.find((c) => c.id === d.id)!;
                        return (
                          <button
                            key={d.id}
                            onClick={() => (d.unlocked ? (setDesign(d.id), setLockedHint(null)) : setLockedHint(`Reach Tier ${d.minTier} to unlock ${d.name}.`))}
                            aria-pressed={on}
                            aria-disabled={!d.unlocked}
                            className="press flex flex-col gap-2 text-left"
                          >
                            <span
                              className={`relative flex aspect-[1.586] w-full items-end overflow-hidden rounded-[16px] p-2.5 transition-[outline-color] duration-150 ${
                                on ? "outline-2 outline-offset-[3px] outline-paper" : "outline-transparent"
                              }`}
                              style={{ background: meta.card, color: meta.ink, boxShadow: `inset 0 0 0 1px ${meta.border}` }}
                            >
                              {!d.unlocked && (
                                <span className="absolute inset-0 flex items-center justify-center bg-black/45">
                                  <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-extrabold text-paper">
                                    <LockIcon size={12} /> Tier {d.minTier}
                                  </span>
                                </span>
                              )}
                            </span>
                            <span className={`px-1 text-sm font-extrabold ${on ? "" : "text-muted-2"}`}>{d.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    {lockedHint && <p className="text-center text-xs font-semibold text-lilac">{lockedHint}</p>}
                  </>
                )}

                {step === 3 && (
                  <>
                    <ul className="flex flex-col rounded-[20px] border border-white/10 bg-white/[0.035]">
                      {[
                        ["Name", name, 0],
                        ["Currency", `${CURRENCY_INFO[currency].name} (${currency})`, 1],
                        ["Finish", designs.find((d) => d.id === design)?.name ?? design, 2],
                      ].map(([label, value, to]) => (
                        <li key={label as string} className="flex items-center gap-3 px-4 py-3.5 not-last:border-b not-last:border-white/[0.06]">
                          <span className="w-20 shrink-0 text-xs font-bold text-muted">{label}</span>
                          <span className="min-w-0 grow truncate text-sm font-extrabold">{value}</span>
                          <button onClick={() => go(to as number)} className="press text-xs font-extrabold text-lilac">
                            Edit
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      role="switch"
                      aria-checked={makeDefault}
                      onClick={() => setMakeDefault((v) => !v)}
                      className="press flex items-center gap-3.5 rounded-[20px] border border-white/[0.08] bg-white/[0.035] px-4 py-3.5 text-left"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-lilac">
                        <StarIcon size={18} />
                      </span>
                      <span className="flex grow flex-col">
                        <span className="text-sm font-extrabold">Send my rewards here</span>
                        <span className="text-xs text-muted">Tier rewards and airdrops land on this card.</span>
                      </span>
                      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${makeDefault ? "bg-violet" : "bg-white/15"}`}>
                        <span className={`absolute top-1 left-1 size-5 rounded-full bg-paper transition-transform duration-200 ease-snappy ${makeDefault ? "translate-x-5" : ""}`} />
                      </span>
                    </button>
                    {pending > 0 && (
                      <p className="flex items-center gap-2.5 rounded-[16px] bg-violet/15 px-4 py-3 text-xs font-semibold text-lilac-soft">
                        <GiftIcon size={16} /> {pending} reward{pending > 1 ? "s are" : " is"} waiting for a card. {pending > 1 ? "They'll" : "It'll"} land on this one.
                      </p>
                    )}
                    <p className="text-[11px] leading-snug text-dim">In-app card: holds an in-app balance. It isn&apos;t a payment card and isn&apos;t on-chain.</p>
                    {error && (
                      <p role="alert" className="rounded-xl bg-red-500/12 px-3 py-2 text-center text-[13px] font-semibold text-red-300">
                        {error}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      {!done && (
        <div className="fixed inset-x-0 bottom-0 z-10 bg-linear-to-t from-ink via-ink/95 to-transparent pt-8 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-[430px] gap-2.5 px-5">
            {step > 0 && (
              <button onClick={() => go(step - 1)} aria-label="Back" className="press flex size-14 shrink-0 items-center justify-center rounded-[18px] border border-white/12 bg-white/[0.06]">
                <ChevronIcon size={20} className="rotate-180" />
              </button>
            )}
            <button disabled={!canNext || busy} onClick={() => (step === 3 ? create() : go(step + 1))} className={primary}>
              {step === 3 ? (busy ? "Creating…" : "Create card") : "Continue"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const primary = "press flex h-14 w-full items-center justify-center rounded-[18px] bg-paper text-[15px] font-extrabold text-on-paper disabled:cursor-not-allowed disabled:opacity-40";
const quiet = "press flex h-12 w-full items-center justify-center rounded-[16px] text-sm font-extrabold text-muted-2";

/** Background glow that follows the chosen finish. */
const glow = (design: string) =>
  ({ silver: "rgba(185,182,198,0.30)", violet: "rgba(123,63,255,0.45)", chrome: "rgba(233,230,243,0.30)", obsidian: "rgba(160,107,255,0.30)" })[design] ?? "rgba(123,63,255,0.4)";
