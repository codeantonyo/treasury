"use client";

import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { telegramSignIn, type TgResult } from "../(auth)/actions";

const AUTH = ["/login", "/register", "/forgot", "/reset"];
type TgWebApp = { initData?: string; ready?: () => void; expand?: () => void; setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void };
const webApp = () => (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

/** Telegram's signed launch data: from the SDK, the launch URL's hash, or kept from the first page. */
function initData(): string | null {
  try {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("tgWebAppData");
    const data = webApp()?.initData || fromHash || sessionStorage.getItem("tg:data");
    if (data) sessionStorage.setItem("tg:data", data);
    return data || null;
  } catch {
    return webApp()?.initData || null;
  }
}

/** Inside the Telegram Mini App: signs the member in with Telegram, or links Telegram after they log in once. */
export default function TelegramBoot() {
  const router = useRouter();
  const path = usePathname();
  const [note, setNote] = useState<TgResult["status"] | null>(null);

  useEffect(() => {
    const data = initData();
    if (!data) return;
    let done = false;
    try {
      done = sessionStorage.getItem("tg:done") === "1";
    } catch {}
    if (done) return;
    let live = true;
    telegramSignIn(data).then((r) => {
      if (!live) return;
      if (r.status === "in" || r.status === "linked") {
        try {
          sessionStorage.setItem("tg:done", "1");
        } catch {}
        if (AUTH.includes(path)) router.replace("/");
        else router.refresh();
      } else if (r.status === "new" && r.ref && path === "/login") router.replace(`/register?ref=${encodeURIComponent(r.ref)}`);
      setNote(r.status === "new" && AUTH.includes(path) ? "new" : r.status === "taken" ? "taken" : null);
    }, () => {});
    return () => {
      live = false;
    };
  }, [path, router]);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => {
          const w = webApp();
          if (!w?.initData) return;
          w.ready?.();
          w.expand?.();
          w.setHeaderColor?.("#07060b");
          w.setBackgroundColor?.("#07060b");
        }}
      />
      {note && (
        <div role="status" className="fixed inset-x-4 top-3 z-50 mx-auto max-w-[358px] rounded-2xl border border-white/12 bg-[#151221]/95 px-4 py-3 text-center text-[13px] font-semibold text-muted-2 backdrop-blur">
          {note === "new" ? "Log in or create your account once. Next time Telegram signs you in." : "This Telegram is linked to another XLM TREASURY account."}
        </div>
      )}
    </>
  );
}
