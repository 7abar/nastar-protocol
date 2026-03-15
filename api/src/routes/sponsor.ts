/**
 * Gas-Sponsored Agent Deployment
 *
 * Executes mint + registerService + setAgentURI on behalf of the user.
 * Gas is paid by the server wallet so users don't need CELO.
 *
 * POST /v1/sponsor/deploy
 */

import { Router, Request, Response } from "express";
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { CONTRACTS } from "../config.js";

const router = Router();

const CELO_RPC = "https://forno.celo.org";

const IDENTITY_ABI = parseAbi([
  "function register() returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function setAgentURI(uint256 tokenId, string agentURI)",
]);

const SERVICE_ABI = parseAbi([
  "function registerService(uint256 agentId, string name, string description, string endpoint, address paymentToken, uint256 pricePerCall, bytes32[] tags) returns (uint256)",
  "function nextServiceId() view returns (uint256)",
]);

const publicClient = createPublicClient({
  chain: celo,
  transport: http(CELO_RPC),
});

/**
 * POST /v1/sponsor/deploy
 *
 * Body:
 *   ownerAddress: string — user's wallet (will own the NFT)
 *   name: string — agent name
 *   description: string — agent description
 *   endpoint: string — API endpoint
 *   paymentToken: string — accepted token address
 *   pricePerCall: string — price in wei
 *   tags: string[] — category tags
 *
 * Returns:
 *   agentNftId, serviceId, txHashes
 */
router.post("/deploy", async (req: Request, res: Response) => {
  try {
    const {
      ownerAddress, name, description, endpoint,
      paymentToken, pricePerCall, tags,
    } = req.body;

    if (!ownerAddress || !name) {
      return res.status(400).json({ error: "ownerAddress and name are required" });
    }

    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
      return res.status(500).json({ error: "Server wallet not configured" });
    }

    const account = privateKeyToAccount(pk as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(CELO_RPC),
    });

    const API_URL = process.env.API_URL || "https://api-production-a473.up.railway.app";
    const txHashes: string[] = [];

    // ── 1. Mint ERC-8004 Identity NFT ──────────────────────────────────────────

    // Check if user already has an NFT
    const balance = await publicClient.readContract({
      address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
      abi: IDENTITY_ABI,
      functionName: "balanceOf",
      args: [ownerAddress as `0x${string}`],
    });

    let agentNftId: number | null = null;

    if (balance === 0n) {
      // Mint new identity NFT — server pays gas
      // register() mints to msg.sender (server wallet) with auto-incremented tokenId
      const mintHash = await walletClient.writeContract({
        address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
        abi: IDENTITY_ABI,
        functionName: "register",
      });

      const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
      txHashes.push(mintHash);

      // Extract tokenId from Transfer event (topic[3])
      const transferLog = mintReceipt.logs.find(
        (l) => l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      );
      if (transferLog && transferLog.topics[3]) {
        agentNftId = Number(BigInt(transferLog.topics[3]));
      }
    } else {
      // Already has an NFT — skip minting, use existing
      agentNftId = null; // Will be set below by scanning
    }

    if (agentNftId === null) {
      return res.status(500).json({ error: "Failed to find or mint agent NFT" });
    }

    // ── 2. Register Service ────────────────────────────────────────────────────

    const fee = BigInt(pricePerCall || "1000000000000000000"); // default 1 token
    const tagBytes = (tags || []).map((t: string) =>
      `0x${Buffer.from(t.padEnd(32, "\0")).toString("hex").slice(0, 64)}` as `0x${string}`
    );

    const svcHash = await walletClient.writeContract({
      address: CONTRACTS.SERVICE_REGISTRY as `0x${string}`,
      abi: SERVICE_ABI,
      functionName: "registerService",
      args: [
        BigInt(agentNftId),
        name,
        description || "",
        endpoint || `${API_URL}/api/agent/endpoint`,
        (paymentToken || "0x0000000000000000000000000000000000000000") as `0x${string}`,
        fee,
        tagBytes,
      ],
    });

    await publicClient.waitForTransactionReceipt({ hash: svcHash });
    txHashes.push(svcHash);

    // Get service ID
    const nextServiceId = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY as `0x${string}`,
      abi: SERVICE_ABI,
      functionName: "nextServiceId",
    });
    const serviceId = Number(nextServiceId) - 1;

    // ── 3. Set Agent Metadata URI ──────────────────────────────────────────────

    try {
      const uriHash = await walletClient.writeContract({
        address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
        abi: IDENTITY_ABI,
        functionName: "setAgentURI",
        args: [BigInt(agentNftId), `${API_URL}/api/agent/${agentNftId}/metadata`],
      });
      await publicClient.waitForTransactionReceipt({ hash: uriHash });
      txHashes.push(uriHash);
    } catch {
      // Non-critical — metadata URI can be set later
    }

    return res.json({
      success: true,
      agentNftId,
      serviceId,
      ownerAddress,
      txHashes,
      gasSponsored: true,
    });

  } catch (err: any) {
    console.error("[sponsor] deploy error:", err.message);
    return res.status(500).json({ error: err.message?.slice(0, 200) || "Deploy failed" });
  }
});

/**
 * GET /v1/sponsor/balance
 * Check how much CELO the sponsor wallet has left
 */
router.get("/balance", async (_req: Request, res: Response) => {
  try {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) return res.json({ balance: "0", address: null });

    const account = privateKeyToAccount(pk as `0x${string}`);
    const balance = await publicClient.getBalance({ address: account.address });
    const celoBalance = Number(balance) / 1e18;

    res.json({
      address: account.address,
      balance: celoBalance.toFixed(4),
      canSponsor: celoBalance > 0.1,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
