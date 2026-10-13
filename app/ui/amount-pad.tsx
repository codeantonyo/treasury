"use client";

import { useEffect, useRef } from "react";
import { CURRENCY_INFO, pressKey } from "@/lib/currencies";
import { BackspaceIcon } from "./icons";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

const pretty = (v: string) => {
  if (!v) return "0";
  const [int, dec] = v.split(".");
  const grouped = Number(int || "0").toLocaleString("en-US");
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
};

/** Big amount display + keypad. `over` makes it shake and show the reason. */
export default function AmountPad({
  value,
  onChange,
  currency,
  maxUnits,
  hint,
  over,
}: {
  value: string;
  onChange: React.Dispatch<React.SetStateAction<string>>; // functional updates: rapid taps never drop a digit
  currency: string;
  maxUnits?: string;
  hint?: string | null;
  over?: string | null;
}) {
  const decimals = CURRENCY_INFO[currency]?.decimals ?? 2;
  const sym = CURRENCY_INFO[currency]?.symbol ?? currency;
  const shown = pretty(value);
  const size = shown.length > 12 ? 30 : shown.length > 8 ? 38 : 48;
  const shake = useRef<HTMLDivElement>(null);

  // Desktop: type digits directly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key === "Backspace" ? "del" : e.key === "," ? "." : e.key;
      if ((KEYS as readonly string[]).includes(k)) onChange((v) => pressKey(v, k, decimals));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decimals, onChange]);

  useEffect(() => {
    if (over) shake.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 260, easing: "ease-out" });
  }, [over]);

  const max = () => {
    if (!maxUnits) return;
    const n = Number(BigInt(maxUnits)) / 1e7;
    onChange(n > 0 ? n.toFixed(decimals).replace(/\.?0+$/, "") : "");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 py-2">
        <div ref={shake} className={`flex items-baseline gap-1.5 font-display leading-none font-extrabold tabular-nums ${over ? "text-red-300" : value ? "text-paper" : "text-dim"}`} style={{ fontSize: size }} aria-live="polite">
          {currency === "XLM" ? (
            <>
              {shown}
              <span className="text-[0.45em] text-muted">XLM</span>
            </>
          ) : (
            <>
              <span className="font-sans text-[0.6em] text-muted">{sym}</span>
              {shown}
            </>
          )}
        </div>
        <div className="flex min-h-5 items-center gap-2 text-xs font-semibold">
          {over ? <span className="text-red-300">{over}</span> : hint ? <span className="text-muted-2">{hint}</span> : null}
          {maxUnits && !over && (
            <button type="button" onClick={max} className="press rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-extrabold text-lilac">
              Max
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Amount keypad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={k === "." && decimals === 0}
            onClick={() => onChange((v) => pressKey(v, k, decimals))}
            aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k}
            className="press flex h-[54px] items-center justify-center rounded-2xl bg-white/[0.045] font-display text-[22px] font-extrabold tabular-nums disabled:opacity-25 active:bg-white/10"
          >
            {k === "del" ? <BackspaceIcon /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
