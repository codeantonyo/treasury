// Number formatting for the Wallet and token pages (usable on the server and in the browser).
export const UP = "#7fe3b9", DOWN = "#ff9d9d";
import { shortNum, usd } from "./currencies";
export { usd };
export const price = (n: number) =>
  n >= 1 ? usd(n) : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 4, minimumSignificantDigits: 2 });
export const pct = (f: number) => `${f >= 0 ? "+" : "−"}${Math.abs(f * 100).toFixed(2)}%`;
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const qty = (n: number) => shortNum(n, n >= 1000 ? 2 : 4);
