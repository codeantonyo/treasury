import { ImageResponse } from "next/og";
import { CACHE, fonts, Orb } from "../art";

const WORD = "XLM TREASURY";
const LINE = "Your Stellar treasury, in Telegram";
const CHIPS = ["12 tiers", "Daily streak", "In-app cards", "Paid referrals"];

/** Telegram welcome banner (1280×640). */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse 60% 75% at 50% 30%, rgba(123,63,255,0.6) 0%, rgba(74,28,160,0.25) 42%, #07060b 78%)",
          color: "#f4f2fa",
          fontFamily: "Manrope",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 70, left: 110, width: 1060, height: 300, borderRadius: 1060, border: "2px solid rgba(201,182,255,0.18)", transform: "rotate(-10deg)" }} />
        <div style={{ position: "absolute", top: 210, left: 160, width: 18, height: 18, borderRadius: 18, background: "#a06bff", boxShadow: "0 0 20px #a06bff" }} />
        <div style={{ position: "absolute", top: 120, right: 190, width: 26, height: 26, borderRadius: 26, background: "#e7e2f7", boxShadow: "0 0 24px rgba(216,212,230,0.7)" }} />
        <Orb size={190} />
        <span style={{ marginTop: 44, fontFamily: "Syne", fontSize: 82, fontWeight: 800, letterSpacing: 6, whiteSpace: "nowrap" }}>{WORD}</span>
        <span style={{ marginTop: 10, fontSize: 32, color: "#c9b6ff" }}>{LINE}</span>
        <div style={{ display: "flex", gap: 14, marginTop: 34 }}>
          {CHIPS.map((c) => (
            <span key={c} style={{ padding: "10px 22px", borderRadius: 40, border: "1.5px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.07)", fontSize: 24, color: "#e2d7ff" }}>
              {c}
            </span>
          ))}
        </div>
      </div>
    ),
    { width: 1280, height: 640, fonts: await fonts(WORD, LINE + CHIPS.join("")), headers: CACHE },
  );
}
