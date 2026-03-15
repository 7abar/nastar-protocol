import { Router } from "express";
import { toBytes, toHex, pad } from "viem";
import { publicClient, serialize, parseBigIntParam } from "../lib/client.js";
import { CONTRACTS } from "../config.js";
import { SERVICE_REGISTRY_ABI } from "../abis.js";
import { x402Required } from "../middleware/x402.js";

const router = Router();

// ── GET /services ─────────────────────────────────────────────────────────────
// List all active services (paginated)
router.get("/", async (req, res) => {
  try {
    const offsetStr = ((req.query.offset as string) ?? "0").replace(/\D/g, "") || "0";
    const limitStr = ((req.query.limit as string) ?? "20").replace(/\D/g, "") || "20";
    const offset = BigInt(offsetStr);
    const limit = BigInt(Math.min(100, parseInt(limitStr))); // cap at 100

    const [services, total] = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getActiveServices",
      args: [offset, limit],
    });

    res.json({
      services: serialize(services),
      total: total.toString(),
      offset: offset.toString(),
      limit: limit.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /services/count ───────────────────────────────────────────────────────
// Total number of registered services (including inactive)
router.get("/count", async (_req, res) => {
  try {
    const count = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "nextServiceId",
    });
    res.json({ count: count.toString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /services/tag/:tag ────────────────────────────────────────────────────
// List service IDs for a given tag (e.g., "research", "translation", "data")
router.get("/tag/:tag", async (req, res) => {
  try {
    const tagBytes = pad(toHex(toBytes(req.params.tag)), { size: 32 });

    const ids = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getServicesByTag",
      args: [tagBytes],
    });

    // Hydrate: fetch full service details for each ID
    const services = await Promise.all(
      ids.map((id) =>
        publicClient.readContract({
          address: CONTRACTS.SERVICE_REGISTRY,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getService",
          args: [id],
        })
      )
    );

    res.json({ tag: req.params.tag, services: serialize(services) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /services/:id ─────────────────────────────────────────────────────────
// Get a specific service by ID
router.get("/:id", async (req, res) => {
  try {
    const serviceId = parseBigIntParam(req.params.id, "serviceId");
    const service = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getService",
      args: [serviceId],
    });
    res.json(serialize(service));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /services/agent/:agentId ──────────────────────────────────────────────
// All services registered by a specific agent (by ERC-8004 NFT ID)
router.get("/agent/:agentId", async (req, res) => {
  try {
    const agentId = parseBigIntParam(req.params.agentId, "agentId");
    const ids = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getAgentServices",
      args: [agentId],
    });

    const services = await Promise.all(
      ids.map((id) =>
        publicClient.readContract({
          address: CONTRACTS.SERVICE_REGISTRY,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getService",
          args: [id],
        })
      )
    );

    res.json({ agentId: agentId.toString(), services: serialize(services) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GET /services/search — x402 gated ────────────────────────────────────────
// Premium: full-text search across service names + descriptions
// Requires on-chain micropayment (x402)
router.get("/search/query", x402Required, async (req, res) => {
  try {
    const q = ((req.query.q as string) ?? "").toLowerCase().trim();
    if (!q) {
      res.status(400).json({ error: "query param 'q' required" });
      return;
    }

    // Fetch all services and filter in-memory (MVP approach)
    const total = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "nextServiceId",
    });

    const allIds = Array.from({ length: Number(total) }, (_, i) => BigInt(i));
    const all = await Promise.all(
      allIds.map((id) =>
        publicClient.readContract({
          address: CONTRACTS.SERVICE_REGISTRY,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getService",
          args: [id],
        })
      )
    );

    const results = all.filter(
      (s) =>
        s.active &&
        (s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    );

    res.json({ query: q, results: serialize(results), count: results.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
