"use client";

import { useState } from "react";

/** Native share sheet where available, else copy the invite link. */
export default function ShareButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      await navigator.share({ text: "Join me on XLM TREASURY", url: link }).catch(() => {}); // user closed the sheet
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      onClick={share}
      className="h-12 min-w-[88px] shrink-0 rounded-[14px] bg-paper px-[18px] text-sm font-extrabold text-on-paper transition-transform active:scale-[0.97]"
    >
      <span aria-live="polite">{copied ? "Copied" : "Share"}</span>
    </button>
  );
}
