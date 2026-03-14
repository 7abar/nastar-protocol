/**
 * /v1/reputation — Agent Reputation Oracle
 *
 * GET /v1/reputation/:agentId          — full reputation profile
 * GET /v1/reputation/:agentId/score    — numeric score only (0-100)
 * GET /v1/reputation/leaderboard       — ranked agents by reputation
 *
 * Scores are computed from on-chain deal history:
 *  - Completion rate (deals completed / accepted)
 *  - Dispute rate (lower = better)
 *  - Response time (how fast deals move from created → accepted)
 *  - Volume (total USDC earned)
 *  - Tenure (time since first deal)
 */

import { Router, Request, Response } from "express";
import { createPublicClient, http, formatUnits } from "viem";
import { defineChain } from "viem";

const router = Router();

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  network: "celo-sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
});

const publicClient = createPublicClient({ chain: celoSepolia, transport: http() });

const ESCROW = (process.env.NASTAR_ESCROW || "0xAE17AaccD135BD434E13990Dd2fAAA743f32b1e1") as `0x${string}`;

const ESCROW_ABI = [
  {
    type: "function", name: "nextDealId",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "getDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "dealId", type: "uint256" }, { name: "serviceId", type: "uint256" },
        { name: "buyerAgentId", type: "uint256" }, { name: "sellerAgentId", type: "uint256" },
        { name: "buyer", type: "address" }, { name: "seller", type: "address" },
        { name: "paymentToken", type: "address" }, { name: "amount", type: "uint256" },
        { name: "taskDescription", type: "string" }, { name: "deliveryProof", type: "string" },
        { name: "status", type: "uint8" }, { name: "createdAt", type: "uint256" },
        { name: "deadline", type: "uint256" }, { name: "completedAt", type: "uint256" },
        { name: "disputedAt", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

// Status enum from contract
enum DealStatus { Created, Accepted, Delivered, Completed, Disputed, Refunded, Expired, Resolved }

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentReputation {
  agentId: number;
  score: number;                   // 0-100 composite score
  tier: "New" | "Bronze" | "Silver" | "Gold" | "Diamond";
  metrics: {
    totalDeals: number;
    completedDeals: number;
    disputedDeals: number;
    completionRate: number;        // 0-100%
    disputeRate: number;           // 0-100%
    avgResponseTimeHours: number;
    totalVolumeUsdc: number;
    tenureDays: number;
  };
  breakdown: {
    completionScore: number;       // 0-35
    disputeScore: number;          // 0-25
    volumeScore: number;           // 0-20
    responseScore: number;         // 0-10
    tenureScore: number;           // 0-10
  };
  lastUpdated: number;
}

// ─── Cache (refresh every 2 minutes) ──────────────────────────────────────────

let cachedReputations: Map<number, AgentReputation> = new Map();
let lastRefresh = 0;
const CACHE_TTL = 120_000; // 2 min

async function refreshReputations(): Promise<void> {
  if (Date.now() - lastRefresh < CACHE_TTL) return;

  try {
    const nextId = await publicClient.readContract({
      address: ESCROW, abi: ESCROW_ABI, functionName: "nextDealId",
    }) as bigint;

    const totalDeals = Number(nextId);
    if (totalDeals === 0) { lastRefresh = Date.now(); return; }

    // Fetch all deals
    interface DealData {
      sellerAgentId: number; buyerAgentId: number; status: number;
      amount: bigint; createdAt: bigint; completedAt: bigint; disputedAt: bigint;
    }

    const deals: DealData[] = [];
    const batchSize = 20;
    for (let i = 0; i < totalDeals; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, totalDeals); j++) {
        batch.push(
          publicClient.readContract({
            address: ESCROW, abi: ESCROW_ABI, functionName: "getDeal", args: [BigInt(j)],
          }).catch(() => null)
        );
      }
      const results = await Promise.all(batch);
      for (const r of results) {
        if (!r) continue;
        const d = r as any;
        deals.push({
          sellerAgentId: Number(d.sellerAgentId),
          buyerAgentId: Number(d.buyerAgentId),
          status: Number(d.status),
          amount: d.amount as bigint,
          createdAt: d.createdAt as bigint,
          completedAt: d.completedAt as bigint,
          disputedAt: d.disputedAt as bigint,
        });
      }
    }

    // Build per-agent stats (seller side)
    const agentStats = new Map<number, {
      totalDeals: number; completed: number; disputed: number;
      volume: bigint; responseTimes: number[]; firstDeal: bigint;
    }>();

    for (const deal of deals) {
      const id = deal.sellerAgentId;
      if (!agentStats.has(id)) {
        agentStats.set(id, {
          totalDeals: 0, completed: 0, disputed: 0,
          volume: 0n, responseTimes: [], firstDeal: deal.createdAt,
        });
      }
      const s = agentStats.get(id)!;
      s.totalDeals++;

      if (deal.status === DealStatus.Completed || deal.status === DealStatus.Resolved) {
        s.completed++;
        s.volume += deal.amount;
        if (deal.completedAt > deal.createdAt) {
          s.responseTimes.push(Number(deal.completedAt - deal.createdAt));
        }
      }
      if (deal.status === DealStatus.Disputed || deal.status === DealStatus.Resolved) {
        s.disputed++;
      }
      if (deal.createdAt < s.firstDeal) s.firstDeal = deal.createdAt;
    }

    // Compute scores
    const newCache = new Map<number, AgentReputation>();
    const now = BigInt(Math.floor(Date.now() / 1000));

    for (const [agentId, s] of agentStats) {
      const completionRate = s.totalDeals > 0 ? (s.completed / s.totalDeals) * 100 : 0;
      const disputeRate = s.totalDeals > 0 ? (s.disputed / s.totalDeals) * 100 : 0;
      const volumeUsdc = parseFloat(formatUnits(s.volume, 6));
      const avgResp = s.responseTimes.length > 0
        ? s.responseTimes.reduce((a, b) => a + b, 0) / s.responseTimes.length / 3600
        : 0;
      const tenureDays = Number(now - s.firstDeal) / 86400;

      // Score components
      const completionScore = Math.min(35, (completionRate / 100) * 35);
      const disputeScore = Math.max(0, 25 - (disputeRate / 100) * 50);
      const volumeScore = Math.min(20, Math.log10(Math.max(1, volumeUsdc)) * 5);
      const responseScore = avgResp <= 0 ? 5 : Math.max(0, 10 - avgResp * 0.5);
      const tenureScore = Math.min(10, tenureDays * 0.5);

      const score = Math.round(
        completionScore + disputeScore + volumeScore + responseScore + tenureScore
      );

      const tier =
        score >= 85 ? "Diamond" :
        score >= 70 ? "Gold" :
        score >= 50 ? "Silver" :
        score >= 30 ? "Bronze" : "New";

      newCache.set(agentId, {
        agentId, score, tier,
        metrics: {
          totalDeals: s.totalDeals,
          completedDeals: s.completed,
          disputedDeals: s.disputed,
          completionRate: Math.round(completionRate * 10) / 10,
          disputeRate: Math.round(disputeRate * 10) / 10,
          avgResponseTimeHours: Math.round(avgResp * 10) / 10,
          totalVolumeUsdc: Math.round(volumeUsdc * 100) / 100,
          tenureDays: Math.round(tenureDays),
        },
        breakdown: {
          completionScore: Math.round(completionScore),
          disputeScore: Math.round(disputeScore),
          volumeScore: Math.round(volumeScore),
          responseScore: Math.round(responseScore),
          tenureScore: Math.round(tenureScore),
        },
        lastUpdated: Date.now(),
      });
    }

    cachedReputations = newCache;
    lastRefresh = Date.now();
  } catch (err) {
    console.error("Reputation refresh error:", err);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/leaderboard", async (_req: Request, res: Response) => {
  await refreshReputations();
  const ranked = [...cachedReputations.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
  return res.json(ranked);
});

router.get("/:agentId", async (req: Request, res: Response) => {
  await refreshReputations();
  const rep = cachedReputations.get(parseInt(req.params.agentId));
  if (!rep) {
    return res.status(404).json({
      error: "Agent not found or has no deal history",
      agentId: req.params.agentId,
      score: 0,
      tier: "New",
    });
  }
  return res.json(rep);
});

router.get("/:agentId/score", async (req: Request, res: Response) => {
  await refreshReputations();
  const rep = cachedReputations.get(parseInt(req.params.agentId));
  return res.json({
    agentId: parseInt(req.params.agentId),
    score: rep?.score ?? 0,
    tier: rep?.tier ?? "New",
  });
});

export default router;
