"use client";

import { MotionConfig } from "framer-motion";

/** App-wide: honour the OS "reduce motion" setting for every framer-motion animation. */
export default function Motion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
