import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  devIndicators: { position: "top-right" }, // keep it off the tab bar
  // The Tiers tab became the Wallet; old links land on the XLMTREASURY2 tiers there.
  redirects: async () => [{ source: "/tiers", destination: "/wallet/XLMTREASURY2", permanent: false }],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
