/** Small ring showing a percentage. */
export default function SwapMeter({ pct, size = 44 }: { pct: number; size?: number }) {
  const r = 18, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" className="shrink-0" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
      <circle
        cx="22" cy="22" r={r} fill="none" stroke="#c9b6ff" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="800" fill="#f4f2fa">{pct}%</text>
    </svg>
  );
}
