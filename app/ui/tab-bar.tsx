"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CardIcon, ProfileIcon, VaultIcon, WalletIcon, XlmMark } from "./icons";

const TABS = [
  { href: "/", label: "Home", Icon: XlmMark },
  { href: "/wallet", label: "Wallet", Icon: WalletIcon },
  { href: "/treasury", label: "Treasury", Icon: VaultIcon },
  { href: "/card", label: "Cards", Icon: CardIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
] as const;

export default function TabBar() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-50 mx-auto flex h-[68px] w-[calc(100%-24px)] max-w-[366px] items-center justify-between rounded-[34px] border border-white/10 bg-bar px-[18px] backdrop-blur-md"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`relative flex size-12 items-center justify-center rounded-full transition-colors duration-200 ${
              active ? "text-on-paper" : "text-muted active:text-paper"
            }`}
          >
            {active && (
              <motion.span
                layoutId="tab-active"
                className="absolute inset-0 rounded-full bg-paper"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <Icon size={href === "/" ? 22 : 20} className="relative" />
          </Link>
        );
      })}
    </nav>
);
}
