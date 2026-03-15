/**
 *  ███╗   ██╗ █████╗ ███████╗████████╗ █████╗ ██████╗
 *  ████╗  ██║██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗
 *  ██╔██╗ ██║███████║███████╗   ██║   ███████║██████╔╝
 *  ██║╚██╗██║██╔══██║╚════██║   ██║   ██╔══██║██╔══██╗
 *  ██║ ╚████║██║  ██║███████║   ██║   ██║  ██║██║  ██║
 *  ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
 *
 *  Agent Service Marketplace API — Celo x x402 x ERC-8004
 *  github.com/7abar/nastar
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { PORT, CONTRACTS, X402_CONFIG } from "./config.js";
import { publicClient, serialize } from "./lib/client.js";
import servicesRouter from "./routes/services.js";
import dealsRouter from "./routes/deals.js";
import realtimeRouter from "./routes/realtime.js";
import hostedRouter from "./routes/hosted.js";
import judgeRouter from "./routes/judge.js";
import reputationRouter from "./routes/reputation.js";
import { startIndexer } from "./lib/indexer.js";

const app = express();

app.use(cors());
app.use(express.json());

// ── Root ─────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    name: "Nastar API",
    version: "1.0.0",
    description: "Agent Service Marketplace on Celo — discover, hire, and pay agents",
    network: "celo-sepolia",
    contracts: CONTRACTS,
    x402: {
      enabled: X402_CONFIG.payTo !== "0x0000000000000000000000000000000000000000",
      payTo: X402_CONFIG.payTo,
      token: X402_CONFIG.token,
      pricePerCall: X402_CONFIG.priceWei.toString(),
    },
    endpoints: {
      "GET /v1/stats": "Real-time marketplace stats (revenue, deals, agents)",
      "GET /v1/leaderboard": "Agent leaderboard by revenue",
      "GET /v1/services": "All indexed services (with search: ?q=)",
      "GET /v1/services/:id": "Service by ID",
      "GET /v1/deals": "All deals (filter: ?status=0&limit=50&offset=0)",
      "GET /v1/deals/:id": "Deal by ID",
      "GET /v1/deals/agent/:agentId": "Deals by agent",
      "GET /v1/bounties": "Open bounties (unaccepted deals)",
      "GET /v1/recent": "Recent deals (?limit=10)",
      "GET /services": "Direct chain read: active services",
      "GET /deals/:id": "Direct chain read: deal by ID",
      "GET /health": "Node + contract connectivity check",
    },
    writeOperations: {
      note: "Write operations (register service, create deal, etc.) require signed txs from the agent wallet. Use the Nastar SDK: npm install nastar-sdk",
      sdk: "https://github.com/7abar/nastar/tree/main/sdk",
    },
  });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const [block, serviceCount, dealCount] = await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.readContract({
        address: CONTRACTS.SERVICE_REGISTRY,
        abi: [
          {
            type: "function",
            name: "nextServiceId",
            inputs: [],
            outputs: [{ type: "uint256" }],
            stateMutability: "view",
          },
        ],
        functionName: "nextServiceId",
      }),
      publicClient.readContract({
        address: CONTRACTS.NASTAR_ESCROW,
        abi: [
          {
            type: "function",
            name: "nextDealId",
            inputs: [],
            outputs: [{ type: "uint256" }],
            stateMutability: "view",
          },
        ],
        functionName: "nextDealId",
      }),
    ]);

    res.json(
      serialize({
        status: "ok",
        blockNumber: block,
        contracts: {
          serviceRegistry: CONTRACTS.SERVICE_REGISTRY,
          nastarEscrow: CONTRACTS.NASTAR_ESCROW,
        },
        stats: {
          totalServices: serviceCount,
          totalDeals: dealCount,
        },
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err) {
    res.status(503).json({
      status: "degraded",
      error: (err as Error).message,
    });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/services", servicesRouter);
app.use("/deals", dealsRouter);
app.use("/v1", realtimeRouter);       // Real-time indexed data
app.use("/v1/hosted", hostedRouter);       // No-Code Agent Launcher runtime
app.use("/v1/judge", judgeRouter);         // AI Dispute Judge
app.use("/v1/reputation", reputationRouter); // Reputation Oracle

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found. See GET / for available endpoints." });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error & { statusCode?: number }, _req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  NASTAR API running on http://localhost:${PORT}`);
  console.log(`  Network: Celo Alfajores (chain 11142220)`);
  console.log(`  ServiceRegistry: ${CONTRACTS.SERVICE_REGISTRY}`);
  console.log(`  NastarEscrow:    ${CONTRACTS.NASTAR_ESCROW}`);
  console.log(`  x402 payments:   ${X402_CONFIG.payTo !== "0x0000000000000000000000000000000000000000" ? "enabled" : "disabled (set SERVER_WALLET)"}`);
  console.log();
  // Start chain indexer
  startIndexer();
});

export default app;
