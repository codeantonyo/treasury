// Display data for card currencies (safe to import in the browser).
export const CURRENCY_INFO: Record<string, { name: string; symbol: string; decimals: number }> = {
  XLM: { name: "Stellar Lumens", symbol: "XLM", decimals: 7 },
  USD: { name: "US Dollar", symbol: "$", decimals: 2 },
  EUR: { name: "Euro", symbol: "€", decimals: 2 },
  GBP: { name: "British Pound", symbol: "£", decimals: 2 },
  AUD: { name: "Australian Dollar", symbol: "A$", decimals: 2 },
  CAD: { name: "Canadian Dollar", symbol: "C$", decimals: 2 },
  CHF: { name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  JPY: { name: "Japanese Yen", symbol: "¥", decimals: 0 },
};

const SUFFIXES: [number, string][] = [
  [1e15, "Q"],
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
];

/** Big numbers trimmed: 2,137,115,231 → "2.137B" (M, B, T, Q). Below a million: full, with `decimals`. */
export function shortNum(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  for (const [v, s] of SUFFIXES) if (abs >= v) return `${(n / v).toLocaleString("en-US", { maximumFractionDigits: 3 })}${s}`;
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** "€1,234.50", "1,234.5 XLM", "¥1,200", and from a million up "€2.137B", "3.43B XLM". `exact` never trims. */
export function formatMoney(n: number, cur: string, exact = false) {
  if (!exact && Math.abs(n) >= 1e6) {
    if (cur === "XLM") return `${shortNum(n)} XLM`;
    const sym = CURRENCY_INFO[cur]?.symbol ?? cur;
    return sym.length > 2 ? `${sym} ${shortNum(n)}` : `${n < 0 ? "−" : ""}${sym}${shortNum(Math.abs(n))}`;
  }
  if (cur === "XLM") return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM`;
  return n.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: cur === "JPY" ? 0 : 2 });
}

export const usd = (n: number) => formatMoney(n, "USD");

/** Amount keypad: apply one key ("0"-"9", ".", "del") to the typed amount, respecting the currency's decimals. */
export function pressKey(value: string, key: string, decimals: number): string {
  if (key === "del") return value.slice(0, -1);
  if (key === ".") return decimals === 0 || value.includes(".") ? value : (value || "0") + ".";
  const [int, dec] = value.split(".");
  if (dec !== undefined) return dec.length >= decimals ? value : value + key;
  if (int === "0") return key; // no leading zeros
  return int.length >= 12 ? value : value + key;
}
