import { ImageResponse } from "next/og";
import { CACHE, fonts, Orb } from "../art";

const WORD = "XLM TREASURY";

/** Email header: planet + wordmark on the app's ink ground (1120×280, shown at 560×140). */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          background: "radial-gradient(ellipse 70% 120% at 50% 0%, rgba(123,63,255,0.55) 0%, rgba(74,28,160,0.22) 45%, #0d0a16 80%)",
        }}
      >
        <Orb size={112} />
        <span style={{ fontFamily: "Syne", fontSize: 62, fontWeight: 800, letterSpacing: 5, color: "#f4f2fa", whiteSpace: "nowrap" }}>{WORD}</span>
      </div>
    ),
    { width: 1120, height: 280, fonts: await fonts(WORD), headers: CACHE },
  );
}
