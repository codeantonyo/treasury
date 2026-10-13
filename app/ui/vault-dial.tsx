"use client";

import { fluid } from "@/lib/format";
import { motion } from "framer-motion";

const C = 150, R = 134, GAP = 5; // 12 segments of 30°, 5° apart

function arc(r: number, from: number, to: number) {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${p(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p(to)}`;
}

/**
 * The vault: one ring segment per tier. Segments up to the member's tier are lit;
 * the next one fills with progress toward it.
 */
export default function VaultDial({ tier, progress, amount, code }: { tier: number; progress: number; amount: string; code: string }) {
  const size = Math.min(34, Math.floor(165 / (amount.length * 0.8))); // fit inside the inner circle (Syne 800 is wide)
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <div
        className="pointer-events-none absolute inset-[12%] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(123,63,255,0.45) 0%, rgba(123,63,255,0.12) 55%, rgba(7,6,11,0) 72%)" }}
      />
      <svg viewBox="0 0 300 300" className="relative size-full" role="img" aria-label={`Tier ${tier} of 12`}>
        <defs>
          {/* Whole-dial filter region: a box sized to each thin arc would clip the blur. */}
          <filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="300" height="300">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={C} cy={C} r={112} fill="none" stroke="rgba(201,182,255,0.22)" strokeDasharray="2 6" className="origin-center motion-safe:animate-[spin_90s_linear_infinite]" />
        <circle cx={C} cy={C} r={98} fill="rgba(14,10,26,0.85)" stroke="rgba(255,255,255,0.08)" />

        {Array.from({ length: 12 }, (_, i) => {
          const n = i + 1, from = i * 30 + GAP / 2, to = (i + 1) * 30 - GAP / 2;
          const fill = n <= tier ? 1 : n === tier + 1 ? progress : 0;
          return (
            <g key={n}>
              <path d={arc(R, from, to)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round" />
              {fill > 0 && (
                <motion.path
                  d={arc(R, from, to)}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="12"
                  strokeLinecap="round"
                  filter={n === tier ? "url(#glow)" : undefined}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: fill }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
              <text
                x={C + 116 * Math.cos(((i * 30 + 15 - 90) * Math.PI) / 180)}
                y={C + 116 * Math.sin(((i * 30 + 15 - 90) * Math.PI) / 180) + 3}
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                fill={n <= tier ? "#e2d7ff" : "#6b6484"}
              >
                {n}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
        <span className="text-[10px] font-extrabold tracking-[0.2em] text-muted">{code}</span>
        <span className="chrome font-display leading-none font-extrabold tabular-nums" style={{ fontSize: fluid(size) }}>
          {amount}
        </span>
        <span className="mt-1 rounded-full bg-paper px-3 py-1 text-[11px] font-extrabold tracking-[0.14em] text-on-paper">
          {tier ? `TIER ${tier}` : "NO TIER"}
        </span>
      </div>
    </div>
  );
}
