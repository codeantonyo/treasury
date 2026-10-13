"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Balances live on the server, so every device shows the same numbers. A tab or Mini App left open in
 * the background still shows what it loaded, so coming back after 30 s reloads the data.
 */
export default function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30_000) router.refresh();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);
  return null;
}
