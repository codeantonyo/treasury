"use client";

// Shared bits for the Wallet list and the token pages.
import { useId } from "react";
import type { Holding } from "@/lib/portfolio";
import { XlmMark } from "./icons";

import { DOWN, UP } from "@/lib/format";

export function TokenIcon({ h, size = 42 }: { h: Holding; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${h.live ? "" : "opacity-45 grayscale-[40%]"}`}
      style={{ width: size, height: size, background: h.orb, boxShadow: "inset 0 -2px 6px rgba(0,0,0,0.25)" }}
      aria-hidden="true"
    >
      {h.native ? <XlmMark size={size * 0.5} className="text-[#1a1426]" /> : <span className="font-display font-extrabold text-black/55" style={{ fontSize: size * 0.3 }}>{h.mono}</span>}
    </span>
  );
}

/** Line chart; `area` adds a soft fill under the line (detail view). */
export function Sparkline({ data, up, width, height, area }: { data: number[]; up: boolean; width: number | "100%"; height: number; area?: boolean }) {
  const id = `spark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const W = typeof width === "number" ? width : 320;
  if (data.length < 2) return <span style={{ width: W, height }} className="shrink-0" />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, height - 3 - ((v - min) / span) * (height - 6)]);
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}`;
  const color = up ? UP : DOWN;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="shrink-0 overflow-visible" aria-hidden="true">
      {area && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${W} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={area ? 2 : 1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
