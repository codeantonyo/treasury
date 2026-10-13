"use client";

import { motion } from "framer-motion";

/** Bar that fills from 0 on first paint. `value` is 0..1. */
export default function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2 overflow-hidden rounded-full bg-black/35"
    >
      <motion.div
        className="h-full origin-left rounded-full bg-linear-to-r from-lilac to-white"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      />
    </div>
  );
}
