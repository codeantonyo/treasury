"use client";

import { motion, useReducedMotion } from "framer-motion";
import { XlmMark } from "./icons";

// Chip positions/sizes from the design (390×392 box). Orbs drift gently; the planet breathes.
// Everything is in design pixels × --u, which shrinks the whole scene to fit narrow or short screens
// (never more than 42% of the screen height, so the balance stays in view inside Telegram).
const u = (n: number) => `calc(${n} * var(--u))`;
const CHIPS = [
  { x: 290, y: 92, size: 40, orb: "radial-gradient(circle at 35% 30%, #fff 0%, #d8d4e6 40%, #6f6a86 100%)", glow: "0 0 22px rgba(216,212,230,0.45)" },
  { x: 26, y: 196, size: 32, orb: "radial-gradient(circle at 35% 30%, #f3ebff 0%, #a06bff 45%, #3b1c7a 100%)", glow: "0 0 22px rgba(160,107,255,0.6)" },
  { x: 262, y: 282, size: 26, orb: "radial-gradient(circle at 35% 30%, #ffffff 0%, #c9b6ff 50%, #4a2c96 100%)", glow: "0 0 18px rgba(201,182,255,0.5)" },
  { x: 92, y: 300, size: 22, orb: "radial-gradient(circle at 35% 30%, #ffffff 0%, #b8b3cc 50%, #45405a 100%)", glow: "none" },
];
const STARS = [[70, 88, 3], [352, 228, 2], [204, 48, 2], [34, 330, 2]];

export default function Orbit({ assets }: { assets: string[] }) {
  const still = useReducedMotion();
  return (
    <div
      className="relative left-1/2 -translate-x-1/2 [--u:min(1px,calc(100vw/390),calc(42svh/392))]"
      style={{ width: u(390), height: u(392) }}
      aria-hidden="true"
    >
      <div className="absolute -rotate-[14deg] rounded-[50%] border border-lilac/22" style={{ top: u(70), left: u(15), width: u(360), height: u(250) }} />
      <div className="absolute -rotate-[14deg] rounded-[50%] border border-lilac/32" style={{ top: u(110), left: u(55), width: u(280), height: u(170) }} />
      <div className="absolute -rotate-[14deg] rounded-[50%] border border-dashed border-paper/28" style={{ top: u(145), left: u(100), width: u(190), height: u(100) }} />

      <motion.div
        className="absolute rounded-full"
        style={{
          top: u(130),
          left: u(130),
          width: u(130),
          height: u(130),
          background: "radial-gradient(circle at 38% 32%, #ffffff 0%, #e7e2f7 18%, #9d8fd6 46%, #3d2585 78%, #1b1036 100%)",
          boxShadow: "0 0 60px rgba(160,107,255,0.65), 0 0 140px rgba(123,63,255,0.35)",
        }}
        animate={still ? undefined : { scale: [1, 1.025, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="absolute text-[#120c22] [&>svg]:size-full" style={{ top: u(164), left: u(164), width: u(62), height: u(62) }}>
        <XlmMark size={62} />
      </span>

      {assets.slice(0, CHIPS.length).map((code, i) => {
        const c = CHIPS[i];
        return (
          <motion.div
            key={code}
            className="absolute flex flex-col items-center"
            style={{ left: u(c.x), top: u(c.y), gap: u(6) }}
            animate={still ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 4 + i * 0.8, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          >
            <span className="rounded-full" style={{ width: u(c.size), height: u(c.size), background: c.orb, boxShadow: c.glow }} />
            <span className="rounded-[9px] border border-white/16 bg-white/8 px-2 py-[3px] text-[max(8.5px,calc(10*var(--u)))] font-extrabold tracking-[0.08em]">
              {code}
            </span>
          </motion.div>
        );
      })}

      {STARS.map(([x, y, s]) => (
        <span key={`${x}-${y}`} className="absolute rounded-full bg-white" style={{ left: u(x), top: u(y), width: s, height: s }} />
      ))}
    </div>
  );
}
