"use client";

import { useEffect } from "react";
import { syncTimeZone } from "../(app)/actions";
import { FlameIcon } from "./icons";

/** Streak count in the header. Also tells the server the device's time zone (days are local). */
export default function StreakPill({ count }: { count: number }) {
  useEffect(() => {
    syncTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => {});
  }, []);
  return (
    <a
      href="#streak"
      className="flex h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3 text-[13px] font-extrabold tabular-nums"
      aria-label={`Daily streak: ${count} days`}
    >
      <FlameIcon className="text-ember" />
      {count}
    </a>
  );
}
