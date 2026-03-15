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
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PORT, CONTRACTS } from "./config.js";
import { publicClient, serialize } from "./lib/client.js";
import servicesRouter from "./routes/services.js";
import dealsRouter from "./routes/deals.js";
import realtimeRouter from "./routes/realtime.js";
import hostedRouter from "./routes/hosted.js";
import judgeRouter from "./routes/judge.js";
import reputationRouter from "./routes/reputation.js";
import swapRouter from "./routes/swap.js";
import oracleRouter from "./routes/oracle.js";
import metadataRouter from "./routes/metadata.js";
import facilitatorRouter from "./routes/facilitator.js";
import { startIndexer } from "./lib/indexer.js";
import { x402AppMiddleware, PAY_TO, NETWORK, PROTECTED_ROUTES } from "./middleware/x402.js";

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());                         // Security headers (XSS, MIME sniffing, etc.)
app.use(cors());
app.use(express.json({ limit: "1mb" }));   // Prevent large payload attacks

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

// x402 — must come before route handlers so protected routes get gated
app.use(x402AppMiddleware);

// ── Root ─────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    name: "Nastar API",
    version: "1.0.0",
    description: "Agent Service Marketplace on Celo — discover, hire, and pay agents",
    network: "celo-sepolia",
    contracts: CONTRACTS,
    x402: {
      enabled: PAY_TO !== "0x0000000000000000000000000000000000000000",
      payTo: PAY_TO,
      network: NETWORK,
      facilitator: "self-hosted (/x402) — Celo Mainnet",
      protectedRoutes: Object.keys(PROTECTED_ROUTES),
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
app.use("/api/agent", metadataRouter);     // ERC-8004 metadata for agentscan.info
app.use("/x402", facilitatorRouter);       // Self-hosted x402 facilitator for Celo
app.use("/v1/judge", judgeRouter);         // AI Dispute Judge
app.use("/v1/reputation", reputationRouter); // Reputation Oracle
app.use("/v1/swap", swapRouter);             // Mento multi-currency swap
app.use("/v1/oracle", oracleRouter);         // Hybrid FX oracle (Pyth + Mento)

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
  console.log(`  x402 payments:   ${PAY_TO !== "0x0000000000000000000000000000000000000000" ? `enabled → ${NETWORK}` : "disabled (set SERVER_WALLET)"}`);
  console.log();
  // Start chain indexer
  startIndexer();
});

export default app;
