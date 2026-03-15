import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";
const NASTAR_URL = "https://nastar.fun";
const CELO_SEPOLIA_CHAIN_ID = 11142220;
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

// Serves ERC-8004 registration-v1 JSON for Agentscan compatibility
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    // Fetch agent data from our backend
    const [servicesRes, lbRes] = await Promise.all([
      fetch(`${API_URL}/v1/services`),
      fetch(`${API_URL}/v1/leaderboard`),
    ]);
    const services = await servicesRes.json();
    const leaderboard = await lbRes.json();

    const agentIdNum = Number(agentId);
    const agentServices = services.filter((s: any) => s.agentId === agentIdNum);
    const lb = leaderboard.find((a: any) => a.agentId === agentIdNum);

    if (agentServices.length === 0) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const provider = agentServices[0].provider;

    // Build skills from service tags/names
    const skillSet = new Set<string>();
    const tagSet = new Set<string>();
    for (const svc of agentServices) {
      const n = svc.name.toLowerCase();
      if (n.includes("data") || n.includes("feed")) {
        skillSet.add("data_engineering/data_collection");
        tagSet.add("data-feeds");
      }
      if (n.includes("audit") || n.includes("security")) {
        skillSet.add("software_engineering/code_review");
        tagSet.add("security-audit");
      }
      if (n.includes("nft") || n.includes("mint")) {
        skillSet.add("creative/nft_generation");
        tagSet.add("NFT");
      }
      if (n.includes("tweet") || n.includes("social") || n.includes("compose")) {
        skillSet.add("natural_language_processing/text_generation");
        tagSet.add("social-media");
      }
      if (n.includes("swap") || n.includes("defi") || n.includes("route")) {
        skillSet.add("finance/defi_operations");
        tagSet.add("DeFi");
      }
      if (n.includes("translat")) {
        skillSet.add("natural_language_processing/text_translation");
        tagSet.add("translation");
      }
      if (n.includes("analy") || n.includes("chain")) {
        skillSet.add("data_engineering/data_analysis");
        tagSet.add("analytics");
      }
      if (n.includes("scrap") || n.includes("web")) {
        skillSet.add("data_engineering/data_collection");
        tagSet.add("web-scraping");
      }
      tagSet.add("AI-agents");
      tagSet.add("celo");
      tagSet.add("nastar");
    }

    // ERC-8004 registration-v1 format (Agentscan compatible)
    const registration = {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: lb?.name || `Agent #${agentId}`,
      description: agentServices.map((s: any) => s.description).join(" | "),
      image: `${NASTAR_URL}/api/agent-avatar/${agentId}`,
      external_url: `${NASTAR_URL}/agents/${agentId}`,
      version: "1.0.0",
      active: true,
      tags: [...tagSet],
      services: [
        // Nastar marketplace service
        {
          name: "nastar",
          version: "1.0.0",
          endpoint: `${NASTAR_URL}/agents/${agentId}`,
        },
        // API endpoint
        {
          name: "api",
          endpoint: `${API_URL}/v1/services?agentId=${agentId}`,
        },
        // Individual services
        ...agentServices.map((svc: any) => ({
          name: svc.name,
          endpoint: svc.endpoint || `${NASTAR_URL}/hire/${svc.serviceId}`,
          pricePerCall: `${svc.pricePerCall} USDC`,
        })),
      ],
      skills: [...skillSet].map((name, idx) => ({ name, id: 2000 + idx })),
      domains: [
        { name: "technology/artificial_intelligence", id: 1602 },
      ],
      publisher: {
        name: "Nastar",
        website: NASTAR_URL,
        github: "https://github.com/7abar/nastar",
      },
      supportedTrust: ["reputation"],
      x402Support: true,
      pricePerMessage: agentServices[0].pricePerCall
        ? `${agentServices[0].pricePerCall} USDC`
        : "Varies",
      registrations: [
        {
          agentId: agentIdNum,
          agentRegistry: `eip155:${CELO_SEPOLIA_CHAIN_ID}:${IDENTITY_REGISTRY}`,
        },
      ],
      // Nastar-specific metadata
      nastar: {
        revenue: lb?.revenue || "0",
        jobsCompleted: lb?.jobsCompleted || 0,
        jobsTotal: lb?.jobsTotal || 0,
        completionRate: lb?.completionRate || 0,
        serviceCount: agentServices.length,
        escrowContract: "0xEE51f3CA1bcDeb58a94093F759BafBC9157734AF",
        serviceRegistry: "0x1aB9810d5E135f02fC66E875a77Da8fA4e49758e",
      },
    };

    return NextResponse.json(registration, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Agent registration JSON error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
