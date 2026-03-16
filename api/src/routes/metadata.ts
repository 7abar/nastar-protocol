/**
 * ERC-8004 Agent Metadata Endpoint
 *
 * Returns rich JSON metadata for agentscan.info and other ERC-8004 explorers.
 * Includes OASF taxonomy (skills, domains), services, publisher info,
 * and registration data — matching the Loopuman gold standard.
 *
 * Format follows ERC-8004 registration-v1 spec.
 */

import { Router, Request, Response } from "express";
import { publicClient } from "../lib/client.js";
import { CONTRACTS } from "../config.js";
import { buildAgentMetadata, getOASFProfile } from "../lib/oasf.js";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const SERVICE_REGISTRY_ABI = [
  {
    type: "function", name: "getServicesByProvider",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [{
      type: "tuple[]", components: [
        { name: "serviceId", type: "uint256" },
        { name: "agentId", type: "uint256" },
        { name: "provider", type: "address" },
        { name: "name", type: "string" },
        { name: "description", type: "string" },
        { name: "endpoint", type: "string" },
        { name: "paymentToken", type: "address" },
        { name: "pricePerCall", type: "uint256" },
        { name: "active", type: "bool" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

const IDENTITY_ABI = [
  {
    type: "function", name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

const API_URL = process.env.API_URL || "https://api.nastar.fun";
const APP_URL = process.env.APP_URL || "https://nastar.fun";

// GET /api/agent/:tokenId/metadata
router.get("/:tokenId/metadata", async (req: Request, res: Response) => {
  try {
    const tokenId = BigInt(req.params.tokenId);
    const tokenIdNum = Number(tokenId);

    // Get owner of the NFT
    let owner: string;
    try {
      owner = await publicClient.readContract({
        address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
        abi: IDENTITY_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      }) as string;
    } catch {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Fetch agent data from Supabase (has template_id, avatar, etc.)
    let agentData: any = null;
    if (supabase) {
      // Try registered_agents first (has avatar)
      const { data: registered } = await supabase
        .from("registered_agents")
        .select("*")
        .eq("agent_nft_id", tokenIdNum);
      if (registered && registered.length > 0) {
        agentData = registered[0];
      }

      // Also check hosted_agents for template_id
      if (!agentData?.template_id) {
        const { data: hosted } = await supabase
          .from("hosted_agents")
          .select("*")
          .eq("agent_nft_id", tokenIdNum);
        if (hosted && hosted.length > 0) {
          agentData = { ...agentData, ...hosted[0] };
        }
      }
    }

    // Get on-chain services
    let services: any[] = [];
    try {
      services = await publicClient.readContract({
        address: CONTRACTS.SERVICE_REGISTRY as `0x${string}`,
        abi: SERVICE_REGISTRY_ABI,
        functionName: "getServicesByProvider",
        args: [owner as `0x${string}`],
      }) as any[];
    } catch {
      // fallback to empty
    }

    const activeServices = services.filter((s: any) => s.active);
    const primaryService = activeServices[0];

    const name = agentData?.name || primaryService?.name || `Nastar Agent #${tokenId}`;
    const description = agentData?.description || primaryService?.description
      || `AI agent registered on Nastar Protocol (ERC-8004 #${tokenId})`;
    const templateId = agentData?.template_id || "custom";
    const avatar = agentData?.avatar;

    // Build full OASF-enriched metadata
    const metadata = buildAgentMetadata({
      name,
      description,
      image: avatar || undefined,
      externalUrl: `${APP_URL}/agents/${tokenIdNum}`,
      templateId,
      agentNftId: tokenIdNum,
      services: activeServices.map((s: any) => ({
        id: Number(s.serviceId),
        name: s.name,
        description: s.description,
        price: Number(s.pricePerCall) / 1e18,
        active: s.active,
      })),
      apiUrl: API_URL,
      appUrl: APP_URL,
    });

    // Add on-chain service details to the metadata
    if (activeServices.length > 0) {
      metadata.services.push({
        name: "escrow",
        endpoint: `${API_URL}/v1/deals`,
        ...({
          description: "On-chain escrow deals via Nastar smart contracts",
          onChainServices: activeServices.map((s: any) => ({
            serviceId: Number(s.serviceId),
            name: s.name,
            description: s.description,
            pricePerCall: (Number(s.pricePerCall) / 1e18).toString(),
            paymentToken: s.paymentToken,
            endpoint: s.endpoint,
          })),
        } as any),
      });
    }

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(metadata);
  } catch (err: any) {
    console.error("Metadata error:", err.message);
    res.status(500).json({ error: "Failed to generate metadata" });
  }
});

// GET /api/agent/:tokenId/oasf.json — standalone OASF taxonomy
router.get("/:tokenId/oasf.json", async (req: Request, res: Response) => {
  try {
    const tokenIdNum = Number(req.params.tokenId);

    // Get template from Supabase
    let templateId = "custom";
    if (supabase) {
      const { data } = await supabase
        .from("hosted_agents")
        .select("template_id")
        .eq("agent_nft_id", tokenIdNum);
      if (data && data.length > 0 && data[0].template_id) {
        templateId = data[0].template_id;
      }
    }

    const oasf = getOASFProfile(templateId);

    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      version: "v0.8.0",
      agentId: tokenIdNum,
      registry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      skills: oasf.skills.map((s) => s.name),
      domains: oasf.domains.map((d) => d.name),
      tags: oasf.tags,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate OASF data" });
  }
});

// GET /api/agent/:tokenId/image — SVG placeholder
router.get("/:tokenId/image", (req: Request, res: Response) => {
  const tokenId = req.params.tokenId;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:#0A0A0A"/>
        <stop offset="100%" style="stop-color:#1A1A1A"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="48" fill="url(#bg)"/>
    <text x="256" y="200" font-family="system-ui,sans-serif" font-size="80" fill="#F4C430" text-anchor="middle" font-weight="bold">N</text>
    <text x="256" y="280" font-family="system-ui,sans-serif" font-size="24" fill="#F5F5F5" text-anchor="middle" font-weight="600">Agent #${tokenId}</text>
    <text x="256" y="320" font-family="system-ui,sans-serif" font-size="14" fill="#A1A1A1" text-anchor="middle">Nastar Protocol</text>
    <text x="256" y="350" font-family="system-ui,sans-serif" font-size="12" fill="#F4C430" text-anchor="middle" opacity="0.6">ERC-8004 on Celo</text>
    <rect x="180" y="400" width="152" height="3" rx="1.5" fill="#F4C430" opacity="0.3"/>
  </svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(svg);
});

export default router;
