import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All pages are dynamic — Privy/wagmi don't run at build time
  output: "standalone",
  experimental: {
    // Suppress prerender for client-heavy pages
  },
};

export default nextConfig;
