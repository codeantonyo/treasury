"use client";

import { useId } from "react";
import { CARDS } from "@/lib/cards";
import { CURRENCY_INFO, usd } from "@/lib/currencies";
import { SnowIcon, StarIcon, XLM_PATH, XlmMark } from "./icons";

/**
 * An in-app card (front): name, a quiet masked number, balance in its own currency, ≈ USD, status.
 * The full number, expiry and CVV are on the back (CardBack). 
 * The name row sits at the very top so it stays readable when the card peeks out of a stack.
 */
export default function CardFace({
  design,
  name,
  display,
  usdValue,
  currency,
  status = "active",
  frozenUntil,
  isDefault,
  hidden,
  last4,
  exact,
}: {
  design: string;
  name: string;
  display: string;
  exact?: string;
  last4?: string;
  usdValue?: number | null;
  currency: string;
  status?: string;
  frozenUntil?: number | null;
  isDefault?: boolean;
  hidden?: boolean;
}) {
  const d = CARDS.find((c) => c.id === design) ?? CARDS[0];
  const sym = CURRENCY_INFO[currency]?.symbol ?? currency;
  const big = hidden ? "••••" : display;
  return (
    <div
      className="relative aspect-[1.586] w-full overflow-hidden rounded-[22px] select-none"
      style={{
        background: d.card,
        color: d.ink,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 0 0 1px ${d.border}, 0 18px 40px rgba(0,0,0,0.45)`,
      }}
    >
      {/* light: top-left glow + diagonal sheen */}
      <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.28), transparent 55%)" }} />
      <span
        className="pointer-events-none absolute -top-1/2 left-[46%] h-[200%] w-[22%] rotate-[24deg]"
        style={{ background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.22), rgba(255,255,255,0))" }}
      />
      {/* the Stellar logo, engraved into the finish */}
      <EngravedMark className="pointer-events-none absolute top-[52%] right-[6%] h-[62%] -translate-y-1/2" />

      <div className="absolute inset-x-[18px] top-[14px] flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-display text-[17px] leading-tight font-extrabold">{name || "Your card"}</span>
          <span className="text-[10px] font-bold tracking-[0.18em] tabular-nums opacity-55">•••• {hidden || !last4 ? "••••" : last4}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-extrabold text-paper">
          {status === "frozen" ? (
            <>
              <SnowIcon size={11} /> FROZEN
            </>
          ) : (
            <>
              {currency === "XLM" ? <XlmMark size={11} /> : sym} {currency}
            </>
          )}
        </span>
      </div>

      <div className="absolute inset-x-[18px] bottom-[16px] flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[9.5px] font-extrabold tracking-[0.18em] opacity-65">IN-APP BALANCE</span>
          <span title={hidden ? undefined : exact} className={`truncate font-display leading-tight font-extrabold tabular-nums ${big.length > 11 ? "text-[21px]" : "text-[min(27px,6.92vw)]"}`}>
            {/* currency symbols read better in the UI font than in Syne */}
            {sym !== currency && big.startsWith(sym) ? (
              <>
                <span className="mr-0.5 font-sans">{sym}</span>
                {big.slice(sym.length)}
              </>
            ) : (
              big
            )}
          </span>
          {usdValue != null && currency !== "USD" && <span className="text-[11px] font-semibold tabular-nums opacity-70">≈ {hidden ? "••" : usd(usdValue)}</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isDefault && (
            <span className="flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[9.5px] font-extrabold tracking-[0.12em] text-paper">
              <StarIcon size={10} /> REWARDS
            </span>
          )}
        </div>
      </div>

      {status === "frozen" && (
        <div className="absolute inset-x-0 top-[54px] bottom-0 flex flex-col items-center justify-center gap-1.5 bg-[#0b0916]/40 text-white backdrop-blur-[3px] [mask-image:linear-gradient(to_bottom,transparent,black_18px)]">
          <span className="flex size-11 items-center justify-center rounded-full bg-white/18">
            <SnowIcon size={22} />
          </span>
          <span className="text-sm font-extrabold">Frozen</span>
          {frozenUntil && (
            <span className="text-[11px] font-semibold opacity-80">
              until {new Date(frozenUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Stellar logo cut into a surface: a slightly darker recess, a shadow on its top-left inner
 * walls and a highlight on its bottom-right ones (light from the top-left). Built from light and
 * shadow only, so it reads on any finish, light or dark.
 */
export function EngravedMark({ className, depth = 1 }: { className?: string; depth?: number }) {
  const id = `engrave-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
          <feOffset in="SourceAlpha" dx="0.26" dy="0.26" result="down" />
          <feComposite in="SourceAlpha" in2="down" operator="out" result="rimTL" />
          <feGaussianBlur in="rimTL" stdDeviation="0.07" result="rimTLsoft" />
          <feFlood floodColor="#000" floodOpacity={0.5 * depth} />
          <feComposite in2="rimTLsoft" operator="in" result="shadow" />
          <feOffset in="SourceAlpha" dx="-0.2" dy="-0.2" result="up" />
          <feComposite in="SourceAlpha" in2="up" operator="out" result="rimBR" />
          <feGaussianBlur in="rimBR" stdDeviation="0.07" result="rimBRsoft" />
          <feFlood floodColor="#fff" floodOpacity={0.55 * depth} />
          <feComposite in2="rimBRsoft" operator="in" result="light" />
          <feFlood floodColor="#000" floodOpacity={0.1 * depth} />
          <feComposite in2="SourceAlpha" operator="in" result="recess" />
          <feMerge>
            <feMergeNode in="recess" />
            <feMergeNode in="shadow" />
            <feMergeNode in="light" />
          </feMerge>
        </filter>
      </defs>
      <path d={XLM_PATH} fill="#000" filter={`url(#${id})`} />
    </svg>
  );
}

/**
 * The back of an in-app card, in the same finish: stripe, full number, expiry and CVV.
 * These numbers start with 8 and fail the Luhn check: no checkout anywhere accepts them.
 */
export function CardBack({
  design,
  number,
  expiry,
  cvv,
  hidden,
}: {
  design: string;
  number: string;
  expiry: string;
  cvv: string;
  hidden?: boolean;
}) {
  const d = CARDS.find((c) => c.id === design) ?? CARDS[0];
  const mask = (v: string) => v.replace(/\d/g, "•");
  return (
    <div
      className="relative aspect-[1.586] w-full overflow-hidden rounded-[22px] select-none"
      style={{ background: d.card, color: d.ink, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 0 0 1px ${d.border}, 0 18px 40px rgba(0,0,0,0.45)` }}
    >
      <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.22), transparent 55%)" }} />
      <EngravedMark className="pointer-events-none absolute top-[64%] right-[6%] h-[40%] -translate-y-1/2 opacity-80" depth={0.8} />
      {/* magnetic stripe */}
      <span className="absolute inset-x-0 top-[13%] h-[19%] bg-[#0b0910]/85" />
      <div className="absolute inset-x-[18px] top-[40%] flex flex-col gap-2.5">
        <span className="text-[17px] font-bold tracking-[0.14em] tabular-nums">{hidden ? mask(number) : number}</span>
        <div className="flex items-end gap-5">
          <span className="flex flex-col">
            <span className="text-[8.5px] font-extrabold tracking-[0.16em] opacity-60">VALID THRU</span>
            <span className="text-[13px] font-bold tracking-[0.1em] tabular-nums">{hidden ? "••/••" : expiry}</span>
          </span>
          <span className="flex flex-col">
            <span className="text-[8.5px] font-extrabold tracking-[0.16em] opacity-60">CVV</span>
            <span className="rounded-[5px] bg-white/85 px-1.5 text-[13px] font-bold tracking-[0.1em] text-on-paper tabular-nums">{hidden ? "•••" : cvv}</span>
          </span>
        </div>
      </div>
      <span className="absolute inset-x-[18px] bottom-[12px] text-[8.5px] font-bold tracking-[0.06em] opacity-55">ISSUED BY STELLAR · IN-APP CARD</span>
    </div>
  );
}
