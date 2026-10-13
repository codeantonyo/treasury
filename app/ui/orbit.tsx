"use client";

import { motion, useReducedMotion } from "framer-motion";
import { XlmMark } from "./icons";

// Chip positions/sizes from the design (390×392 box). Orbs drift gently; the planet breathes.
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
    <div className="relative left-1/2 h-[392px] w-[390px] -translate-x-1/2" aria-hidden="true">
      <div className="absolute top-[70px] left-[15px] h-[250px] w-[360px] -rotate-[14deg] rounded-[50%] border border-lilac/22" />
      <div className="absolute top-[110px] left-[55px] h-[170px] w-[280px] -rotate-[14deg] rounded-[50%] border border-lilac/32" />
      <div className="absolute top-[145px] left-[100px] h-[100px] w-[190px] -rotate-[14deg] rounded-[50%] border border-dashed border-paper/28" />

      <motion.div
        className="absolute top-[130px] left-[130px] size-[130px] rounded-full"
        style={{
          background: "radial-gradient(circle at 38% 32%, #ffffff 0%, #e7e2f7 18%, #9d8fd6 46%, #3d2585 78%, #1b1036 100%)",
          boxShadow: "0 0 60px rgba(160,107,255,0.65), 0 0 140px rgba(123,63,255,0.35)",
        }}
        animate={still ? undefined : { scale: [1, 1.025, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <XlmMark size={62} className="absolute top-[164px] left-[164px] text-[#120c22]" />

      {assets.slice(0, CHIPS.length).map((code, i) => {
        const c = CHIPS[i];
        return (
          <motion.div
            key={code}
            className="absolute flex flex-col items-center gap-1.5"
            style={{ left: c.x, top: c.y }}
            animate={still ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 4 + i * 0.8, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          >
            <span className="rounded-full" style={{ width: c.size, height: c.size, background: c.orb, boxShadow: c.glow }} />
            <span className="rounded-[9px] border border-white/16 bg-white/8 px-2 py-[3px] text-[10px] font-extrabold tracking-[0.08em]">
              {code}
            </span>
          </motion.div>
        );
      })}

      {STARS.map(([x, y, s]) => (
        <span key={`${x}-${y}`} className="absolute rounded-full bg-white" style={{ left: x, top: y, width: s, height: s }} />
      ))}
    </div>
  );
}
