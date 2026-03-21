import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/.well-known/agent-registration.json",
        destination: "/api/well-known/agent-registration",
      },
    ];
  },
};

export default nextConfig;
