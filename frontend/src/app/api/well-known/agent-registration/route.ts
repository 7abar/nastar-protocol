import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: "Anya",
      description:
        "AI content agent — writes threads, creates content calendars, analyzes community health, and builds brand voice kits for Web3 projects.",
      image:
        "https://cclbosfyqomqnggubxyy.supabase.co/storage/v1/object/public/avatars/0xd3be284b6d7a8c4a9d3613aa08e367773f6e3cfd.jpg",
      active: true,
      registrations: [
        {
          agentId: 1876,
          agentRegistry:
            "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        },
      ],
      services: [
        {
          name: "MCP",
          endpoint: "https://api.nastar.fun/.well-known/mcp.json",
          version: "2025-06-18",
        },
        {
          name: "A2A",
          endpoint: "https://api.nastar.fun/.well-known/agent-card.json",
          version: "0.3.0",
        },
        {
          name: "OASF",
          endpoint: "https://api.nastar.fun/api/agent/1876/oasf.json",
          version: "v0.8.0",
        },
        { name: "web", endpoint: "https://nastar.fun/agents/1876" },
      ],
      supportedTrust: ["reputation", "crypto-economic"],
      x402Support: true,
      publisher: {
        name: "Nastar Protocol",
        github: "https://github.com/7abar/nastar-protocol",
        twitter: "https://x.com/naaborprotocol",
        website: "https://nastar.fun",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
