// Icons from the design canvas. Stroke icons inherit currentColor.
import type { ReactNode } from "react";

type P = { size?: number; className?: string; strokeWidth?: number };

const icon = (children: ReactNode, defaultSize = 20, defaultStroke = 2) =>
  function Icon({ size = defaultSize, className, strokeWidth = defaultStroke }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };

/** The Stellar logo outline (24×24). */
export const XLM_PATH =
  "M12.283 1.851A10.154 10.154 0 001.846 12.002c0 .259.01.516.03.773A1.847 1.847 0 01.872 14.56L0 15.005v2.074l2.568-1.309.832-.424.82-.417 14.71-7.496 1.653-.842L24 4.85V2.776l-3.387 1.728-2.89 1.473-13.955 7.108a8.376 8.376 0 01-.07-1.086 8.313 8.313 0 0112.366-7.247l1.654-.843.247-.126a10.154 10.154 0 00-5.682-1.932zM24 6.925L5.055 16.571l-1.653.844L0 19.15v2.072L3.378 19.5l2.89-1.473 13.97-7.117a8.474 8.474 0 01.07 1.092A8.313 8.313 0 017.93 19.248l-.101.054-1.793.914a10.154 10.154 0 0016.119-8.214c0-.26-.01-.522-.03-.78a1.848 1.848 0 011.003-1.785L24 8.992Z";

export function XlmMark({ size = 22, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d={XLM_PATH} />
    </svg>
  );
}

/** Four-point star used for Dust. Filled. */
export function DustIcon({ size = 14, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10Z" />
    </svg>
  );
}

export const VaultIcon = icon(<><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="12" cy="12" r="4" /><path d="M12 8v1.5M12 14.5V16M8 12h1.5M14.5 12H16M3 9h-1M3 15h-1" /></>);
export const CardIcon = icon(<><rect x="2.5" y="5.5" width="19" height="13" rx="3" /><path d="M2.5 10h19" /></>);
export const ProfileIcon = icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>);
export const FlameIcon = icon(<path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" />, 15);
export const BellIcon = icon(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>, 17, 1.8);
export const SendIcon = icon(<path d="M7 17 17 7M9 7h8v8" />, 18, 2.2);
export const ReceiveIcon = icon(<path d="M17 7 7 17M15 17H7V9" />, 18, 2.2);
export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />, 18);
export const LockIcon = icon(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>, 16);
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />, 16, 2.4);
export const ShareIcon = icon(<><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>, 16);
export const GearIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
  18,
  1.8,
);

export const CopyIcon = icon(<><rect x="8" y="8" width="13" height="13" rx="3" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>, 16);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, 18);
export const ExternalIcon = icon(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>, 14);
export const SwapIcon = icon(<><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>, 18);
export const GiftIcon = icon(<><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18" /><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-1 6-1.5S14 4 12 8z" /></>, 18);
export const CalendarIcon = icon(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>, 18);
export const WalletIcon = icon(<><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15V7" /><circle cx="16" cy="14" r="1.5" /></>, 18);
export const DotsIcon = icon(<><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>, 20);
export const SnowIcon = icon(<path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" />, 18);
export const XIcon = icon(<path d="M18 6 6 18M6 6l12 12" />, 20);
export const PencilIcon = icon(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>, 18);
export const BackspaceIcon = icon(<><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" /><path d="m12 9 6 6M18 9l-6 6" /></>, 22);
export const StarIcon = icon(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />, 14);
export const PlaneIcon = icon(<path d="M10.5 13.5 3 11l1-2 8 1 5-5.5c1-1 2.5-1 3 0s0 2-1 3L13.5 13l1 8-2 1-2.5-7.5L7 17v3l-2 1-1-4-4-1 1-2h3z" />, 22);
export const CartIcon = icon(<><path d="M3 4h2l2.5 11h11l2-8H6.5" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>, 22);
export const HeartIcon = icon(<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z" />, 22);
export const SparkleIcon = icon(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />, 22);
export const ArrowInIcon = icon(<path d="M17 7 7 17M15 17H7V9" />, 16, 2.2);
export const ArrowOutIcon = icon(<path d="M7 17 17 7M9 7h8v8" />, 16, 2.2);
