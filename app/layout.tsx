import type { Metadata, Viewport } from "next";
import { Manrope, Syne } from "next/font/google";
import Motion from "./ui/motion";
import TelegramBoot from "./ui/telegram-boot";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const syne = Syne({ variable: "--font-syne", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "XLM TREASURY",
  description: "Hold XLMTREASURY2, rise through 12 tiers and earn for every friend you bring.",
};

export const viewport: Viewport = {
  themeColor: "#07060b",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${syne.variable} antialiased`}>
      <body className="font-sans">
        <Motion>{children}</Motion>
        <TelegramBoot />
      </body>
    </html>
  );
}
