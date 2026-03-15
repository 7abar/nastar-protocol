/**
 * ERC-8004 Agent Metadata Endpoint
 *
 * Returns JSON metadata for agentscan.info and other ERC-8004 explorers.
 * Called when agentURI(tokenId) is read from the IdentityRegistry contract.
 *
 * Format follows ERC-8004 metadata standard:
 * { name, description, image, external_url, attributes[] }
 */

import { Router, Request, Response } from "express";
import { publicClient } from "../lib/client.js";
import { CONTRACTS } from "../config.js";

const router = Router();

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

const API_URL = process.env.API_URL || "https://api-production-a473.up.railway.app";
const APP_URL = process.env.APP_URL || "https://nastar.fun";

// GET /api/agent/:tokenId/metadata
router.get("/:tokenId/metadata", async (req: Request, res: Response) => {
  try {
    const tokenId = BigInt(req.params.tokenId);

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

    // Try to get services registered by this owner
    let services: any[] = [];
    try {
      services = await publicClient.readContract({
        address: CONTRACTS.SERVICE_REGISTRY as `0x${string}`,
        abi: SERVICE_REGISTRY_ABI,
        functionName: "getServicesByProvider",
        args: [owner as `0x${string}`],
      }) as any[];
    } catch {
      // ServiceRegistry might not have this function — fallback to empty
    }

    const activeServices = services.filter((s: any) => s.active);
    const primaryService = activeServices[0];

    const name = primaryService?.name || `Nastar Agent #${tokenId}`;
    const description = primaryService?.description || `AI agent registered on Nastar Protocol (ERC-8004 #${tokenId})`;

    // Build attributes
    const attributes: { trait_type: string; value: string | number }[] = [
      { trait_type: "Platform", value: "Nastar Protocol" },
      { trait_type: "Chain", value: "Celo" },
      { trait_type: "Token ID", value: Number(tokenId) },
      { trait_type: "Owner", value: owner },
      { trait_type: "Services", value: activeServices.length },
    ];

    if (primaryService) {
      const price = Number(primaryService.pricePerCall) / 1e18;
      attributes.push(
        { trait_type: "Primary Service", value: primaryService.name },
        { trait_type: "Price", value: `${price} USDC` },
      );
    }

    // ERC-8004 metadata JSON
    const metadata = {
      name,
      description,
      image: `${APP_URL}/api/agent/${tokenId}/image`,
      external_url: `${APP_URL}/profile/${owner}`,
      animation_url: undefined,
      attributes,
      // Extended fields
      properties: {
        platform: "Nastar Protocol",
        chain: "celo",
        owner,
        services: activeServices.map((s: any) => ({
          id: Number(s.serviceId),
          name: s.name,
          description: s.description,
          price: Number(s.pricePerCall) / 1e18,
          active: s.active,
        })),
        endpoints: {
          profile: `${APP_URL}/profile/${owner}`,
          chat: activeServices.length > 0 ? `${APP_URL}/chat/${activeServices[0].agentId}` : undefined,
          api: `${API_URL}/v1/services`,
        },
      },
    };

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(metadata);
  } catch (err: any) {
    console.error("Metadata error:", err.message);
    res.status(500).json({ error: "Failed to generate metadata" });
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
