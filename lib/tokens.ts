// Token registry: every token the Wallet shows. Add an issuer to a placeholder to make it live
// (balances, prices and Total value pick it up with no other code changes).
export type Token = {
  code: string;
  issuer: string | null; // null + !native = not live yet ("coming soon")
  name: string;
  native?: true;
  homeDomain?: string;
  hasTiers?: true; // the token has a tier ladder (LADDERS in lib/tiers.ts)
  orb: string; // icon gradient
  color: string; // solid colour (allocation bar)
  mono: string; // 2-letter monogram on the icon
};

export const XLM: Token = {
  code: "XLM",
  issuer: null,
  native: true,
  name: "Stellar Lumens",
  color: "#d8d4e6",
  mono: "",
  orb: "radial-gradient(circle at 35% 30%, #ffffff 0%, #d8d4e6 42%, #6f6a86 100%)",
};

export const MAIN_TOKEN: Token = {
  code: "XLMTREASURY2",
  issuer: "GDRAO6ODFYDGPGO7DFJASEROKLTZF3C3CUHHJATBYEAKKDBFWU7TCXLM",
  name: "XLM Treasury",
  homeDomain: "xlmtreasuryv2.com",
  hasTiers: true,
  color: "#a06bff",
  mono: "T2",
  orb: "radial-gradient(circle at 35% 30%, #f3ebff 0%, #a06bff 45%, #3b1c7a 100%)",
};

export const ECOSYSTEM_TOKENS: Token[] = [
  {
    code: "XLMRWA",
    issuer: "GCB5YFZSQXHQ42566JP343CXHOBZH26F752TM7ACPJCRCPB4BZAHHRWA",
    name: "XLM RWA",
    homeDomain: "stellartokenization.org",
    hasTiers: true,
    color: "#e8c46a",
    mono: "RW",
    orb: "radial-gradient(circle at 35% 30%, #fff7d6 0%, #e8c46a 45%, #6b4e12 100%)",
  },
  {
    code: "STELLARUSD",
    issuer: "GCEGQB4K24EUVYTSPSLSYG3VGS7CWZP6GYSVT4RJ2MMRX2YRXOCUNUSD",
    name: "Stellar USD",
    homeDomain: "qstellarusd.com",
    hasTiers: true,
    color: "#6fe0a8",
    mono: "$U",
    orb: "radial-gradient(circle at 35% 30%, #e8fff1 0%, #6fe0a8 45%, #12553a 100%)",
  },
  {
    code: "PROTOCOL26",
    issuer: "GBK3MIB46ZV4DZB23ZB6LA2KDC5M77H3UGF3AS6HZ7BL4GIBN3GEVCOL",
    name: "Protocol 26",
    homeDomain: "26protocol.com",
    hasTiers: true,
    color: "#c9b6ff",
    mono: "26",
    orb: "radial-gradient(circle at 35% 30%, #ffffff 0%, #c9b6ff 50%, #4a2c96 100%)",
  },
  {
    code: "DTCCPROTOCOL",
    issuer: "GB5SDXTYWRHILZA75HHG34OLHOFZSUFD2TVL45ZHFREZCPCTAGRTDTCC",
    name: "DTCC Protocol",
    homeDomain: "dtccprotocol.com",
    color: "#6fc3ff",
    mono: "DT",
    orb: "radial-gradient(circle at 35% 30%, #e3f6ff 0%, #6fc3ff 45%, #12406b 100%)",
  },
  {
    code: "STELLARBONDS",
    issuer: "GDUT2TVTNZR5H6VHUULA352CQRPDGBNWH6NRC2RTJ3CZA4WG3WUF5QFS",
    name: "Stellar Bonds",
    homeDomain: "stellarbonds26.com",
    color: "#ff9fc8",
    mono: "SB",
    orb: "radial-gradient(circle at 35% 30%, #fff0f6 0%, #ff9fc8 45%, #6b1240 100%)",
  },
  // ponytail: placeholders until the owner provides issuers ("coming soon" in the Wallet).
  { code: "XLMAU", issuer: null, name: "XLM AU", color: "#f0d78c", mono: "AU", orb: "radial-gradient(circle at 35% 30%, #fffbe6 0%, #f0d78c 45%, #7a5e1a 100%)" },
  { code: "XLMAI", issuer: null, name: "XLM AI", color: "#8fd3ff", mono: "AI", orb: "radial-gradient(circle at 35% 30%, #eef9ff 0%, #8fd3ff 45%, #1a4f7a 100%)" },
  { code: "XLMESTATE", issuer: null, name: "XLM Estate", color: "#9be6c0", mono: "ES", orb: "radial-gradient(circle at 35% 30%, #effff6 0%, #9be6c0 45%, #1e5c40 100%)" },
];

/** Everything the Wallet lists, in display order. */
export const WALLET_TOKENS: Token[] = [XLM, MAIN_TOKEN, ...ECOSYSTEM_TOKENS];

export const isLive = (t: Token) => !!t.native || !!t.issuer;
