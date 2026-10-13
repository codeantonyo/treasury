// Brand art drawn with next/og (Satori): the email header and the Telegram welcome banner.
// Served as PNGs from /brand/*.png so email clients and Telegram can load them.
import { XLM_PATH } from "../ui/icons";

/** A Google font (the app's faces: Syne, Manrope) subset to `text`. Skipped if it can't be loaded. */
async function font(family: string, weight: 600 | 800, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? [{ name: family, data: await (await fetch(url)).arrayBuffer(), weight, style: "normal" as const }] : [];
  } catch {
    return [];
  }
}

/** Syne ExtraBold for the wordmark, Manrope SemiBold for everything else. */
export async function fonts(word: string, body = "") {
  return [...(await font("Syne", 800, word)), ...(body ? await font("Manrope", 600, body) : [])];
}

/** The silver planet with the engraved Stellar mark, as in the app's hero. */
export function Orb({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 38% 32%, #ffffff 0%, #e7e2f7 18%, #9d8fd6 46%, #3d2585 78%, #1b1036 100%)",
        boxShadow: `0 0 ${size * 0.45}px rgba(160,107,255,0.65)`,
      }}
    >
      <svg width={size * 0.48} height={size * 0.48} viewBox="0 0 24 24">
        <path fill="#120c22" d={XLM_PATH} />
      </svg>
    </div>
  );
}

export const CACHE = { "cache-control": "public, max-age=86400, s-maxage=604800" };
