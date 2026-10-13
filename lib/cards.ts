import type { CardId } from "./db";

// Card designs. `minTier` = lowest tier that unlocks the design.
export type CardDesign = {
  id: CardId;
  name: string;
  minTier: number;
  card: string; // full-card background
  thumb: string; // collection swatch
  ink: string; // text colour on the card
  border: string;
};

export const CARDS: CardDesign[] = [
  {
    id: "silver",
    name: "Silver",
    minTier: 1,
    card: "linear-gradient(125deg, #1d1b24 0%, #4a4757 38%, #8f8aa6 70%, #e9e6f3 100%)",
    thumb: "linear-gradient(125deg, #3a3746, #b9b6c6)",
    ink: "#f4f2fa",
    border: "rgba(255,255,255,0.35)",
  },
  {
    id: "violet",
    name: "Violet",
    minTier: 3,
    card: "linear-gradient(125deg, #1a1030 0%, #3b1c7a 38%, #7b3fff 70%, #c9b6ff 100%)",
    thumb: "linear-gradient(125deg, #3b1c7a, #c9b6ff)",
    ink: "#f4f2fa",
    border: "rgba(255,255,255,0.35)",
  },
  {
    id: "chrome",
    name: "Chrome",
    minTier: 6,
    card: "linear-gradient(125deg, #6f6a86 0%, #d9d6e6 34%, #ffffff 50%, #a9a4bd 72%, #e9e6f3 100%)",
    thumb: "linear-gradient(125deg, #8f8aa6, #ffffff 50%, #8f8aa6)",
    ink: "#140e22",
    border: "rgba(255,255,255,0.6)",
  },
  {
    id: "obsidian",
    name: "Obsidian",
    minTier: 9,
    card: "linear-gradient(125deg, #000000 0%, #0d0b14 55%, #1d1a26 100%)",
    thumb: "linear-gradient(125deg, #000000, #1d1a26)",
    ink: "#e2d7ff",
    border: "#a06bff",
  },
];
