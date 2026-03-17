import { Router } from "express";
import { publicClient, serialize, DEAL_STATUS, parseBigIntParam } from "../lib/client.js";
import { getTokenMeta } from "../config.js";
import { CONTRACTS } from "../config.js";
import { NASTAR_ESCROW_ABI } from "../abis.js";
import { x402Required } from "../middleware/x402.js";

const router = Router();

// ── GET /deals — list recent deals ────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const nextDealId = await publicClient.readContract({
      address: CONTRACTS.NASTAR_ESCROW as `0x${string}`,
      abi: NASTAR_ESCROW_ABI,
      functionName: "nextDealId",
    }) as bigint;

    const total = Number(nextDealId);
    if (total === 0) return res.json({ deals: [], total: 0 });

    // Fetch most recent deals first
    const start = Math.max(0, total - limit);
    const ids = Array.from({ length: total - start }, (_, i) => total - 1 - i);

    const deals = await Promise.all(
      ids.map(async (id) => {
        try {
          const deal = await publicClient.readContract({
            address: CONTRACTS.NASTAR_ESCROW as `0x${string}`,
            abi: NASTAR_ESCROW_ABI,
            functionName: "getDeal",
            args: [BigInt(id)],
          }) as any;
          const token = getTokenMeta(deal.paymentToken);
          return {
            dealId: id,
            serviceId: Number(deal.serviceId),
            buyerAgentId: Number(deal.buyerAgentId),
            sellerAgentId: Number(deal.sellerAgentId),
            status: Number(deal.status),
            statusLabel: DEAL_STATUS[Number(deal.status)] || "Unknown",
            buyer: deal.buyer,
            seller: deal.seller,
            token: deal.paymentToken,
            tokenSymbol: token?.symbol || "USDC",
            amount: deal.amount?.toString() || "0",
            taskDescription: deal.taskDescription,
            deliveryProof: deal.deliveryProof,
          };
        } catch { return null; }
      })
    );

    res.json(serialize({ deals: deals.filter(Boolean), total }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /deals/count ──────────────────────────────────────────────────────────
router.get("/count", async (_req, res) => {
  try {
    const count = await publicClient.readContract({
      address: CONTRACTS.NASTAR_ESCROW,
      abi: NASTAR_ESCROW_ABI,
      functionName: "nextDealId",
    });
    res.json({ count: count.toString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /deals/:id ────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const dealId = parseBigIntParam(req.params.id, "dealId");
    const deal = await publicClient.readContract({
      address: CONTRACTS.NASTAR_ESCROW,
      abi: NASTAR_ESCROW_ABI,
      functionName: "getDeal",
      args: [dealId],
    });

    const serialized = serialize(deal) as Record<string, unknown>;

    serialized.statusLabel = DEAL_STATUS[deal.status] ?? "Unknown";
    serialized.tokenMeta = getTokenMeta(deal.paymentToken);

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /deals/agent/:agentId ─────────────────────────────────────────────────
// All deals for an agent (both buyer and seller sides)
router.get("/agent/:agentId", async (req, res) => {
  try {
    const agentId = parseBigIntParam(req.params.agentId, "agentId");

    const [buyerIds, sellerIds] = await Promise.all([
      publicClient.readContract({
        address: CONTRACTS.NASTAR_ESCROW,
        abi: NASTAR_ESCROW_ABI,
        functionName: "getBuyerDeals",
        args: [agentId],
      }),
      publicClient.readContract({
        address: CONTRACTS.NASTAR_ESCROW,
        abi: NASTAR_ESCROW_ABI,
        functionName: "getSellerDeals",
        args: [agentId],
      }),
    ]);

    // Hydrate deals
    const hydrateDeals = async (ids: readonly bigint[], role: string) => {
      const deals = await Promise.all(
        ids.map((id) =>
          publicClient.readContract({
            address: CONTRACTS.NASTAR_ESCROW,
            abi: NASTAR_ESCROW_ABI,
            functionName: "getDeal",
            args: [id],
          })
        )
      );
      return deals.map((d) => ({
        ...(serialize(d) as Record<string, unknown>),
        role,
        statusLabel: DEAL_STATUS[d.status] ?? "Unknown",
      }));
    };

    const [asBuyer, asSeller] = await Promise.all([
      hydrateDeals(buyerIds, "buyer"),
      hydrateDeals(sellerIds, "seller"),
    ]);

    // Compute reputation stats
    const allDeals = [...asBuyer, ...asSeller];
    const completedCount = allDeals.filter((d) => d.statusLabel === "Completed").length;
    const disputeCount = allDeals.filter((d) => d.statusLabel === "Disputed").length;
    const reputationScore =
      allDeals.length > 0
        ? Math.round((completedCount / allDeals.length) * 100)
        : 0;

    res.json({
      agentId: agentId.toString(),
      asBuyer,
      asSeller,
      stats: {
        totalDeals: allDeals.length,
        completedDeals: completedCount,
        disputedDeals: disputeCount,
        reputationScore: `${reputationScore}%`,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /deals/analytics — x402 gated ────────────────────────────────────────
// Premium: marketplace-wide deal analytics
// Requires micropayment via x402
router.get("/analytics/summary", x402Required, async (req, res) => {
  try {
    const total = await publicClient.readContract({
      address: CONTRACTS.NASTAR_ESCROW,
      abi: NASTAR_ESCROW_ABI,
      functionName: "nextDealId",
    });

    const allIds = Array.from({ length: Number(total) }, (_, i) => BigInt(i));
    const deals = await Promise.all(
      allIds.map((id) =>
        publicClient.readContract({
          address: CONTRACTS.NASTAR_ESCROW,
          abi: NASTAR_ESCROW_ABI,
          functionName: "getDeal",
          args: [id],
        })
      )
    );

    const statusCounts: Record<string, number> = {};
    let totalVolume = BigInt(0);

    for (const deal of deals) {
      const label = DEAL_STATUS[deal.status] ?? "Unknown";
      statusCounts[label] = (statusCounts[label] ?? 0) + 1;
      if (deal.status === 3) {
        // Completed
        totalVolume += deal.amount;
      }
    }

    res.json({
      totalDeals: total.toString(),
      totalCompletedVolume: totalVolume.toString(),
      byStatus: statusCounts,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
