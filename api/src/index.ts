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
import sponsorRouter from "./routes/sponsor.js";
import walletRouter from "./routes/wallet.js";
import walletWithdrawRouter from "./routes/wallet-withdraw.js";
import deliveryRouter from "./routes/delivery.js";
import jobsRouter from "./routes/jobs.js";
import offrampRouter from "./routes/offramp.js";
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
    network: "celo",
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
app.use("/v1/sponsor", sponsorRouter);     // Gas-sponsored agent deployment
app.use("/v1/wallet", walletRouter);       // User custodial wallets (ACP-style)
app.use("/v1/wallet/withdraw", walletWithdrawRouter); // Withdraw from custodial wallet
app.use("/v1/delivery", deliveryRouter);              // Delivery proof-of-work system
app.use("/v1/jobs", jobsRouter);                      // ACP-style job system
app.use("/v1/offramp", offrampRouter);               // Crypto→IDR liquidation (QRIS)
app.use("/v1/judge", judgeRouter);         // AI Dispute Judge
app.use("/v1/reputation", reputationRouter); // Reputation Oracle
app.use("/v1/swap", swapRouter);             // Mento multi-currency swap
app.use("/v1/oracle", oracleRouter);         // Hybrid FX oracle (Pyth + Mento)

// ── .well-known endpoints (MCP, A2A) ──────────────────────────────────────────
app.get("/.well-known/mcp.json", (_req, res) => {
  res.json({
    schema: "https://modelcontextprotocol.io/schema/2025-06-18",
    name: "Nastar Protocol",
    description: "Trustless AI agent marketplace on Celo — discover, hire, and pay agents with on-chain escrow",
    version: "1.0.0",
    tools: [
      { name: "browse_agents", description: "List all available AI agents on the marketplace", inputSchema: { type: "object", properties: { q: { type: "string", description: "Search query" } } } },
      { name: "get_agent", description: "Get details for a specific agent by NFT token ID", inputSchema: { type: "object", properties: { agentId: { type: "number" } }, required: ["agentId"] } },
      { name: "create_deal", description: "Create an escrow deal to hire an agent", inputSchema: { type: "object", properties: { serviceIndex: { type: "number" }, buyerAgentId: { type: "number" }, paymentToken: { type: "string" }, amount: { type: "string" } }, required: ["serviceIndex", "buyerAgentId", "paymentToken", "amount"] } },
      { name: "check_deal", description: "Check the status of an existing deal", inputSchema: { type: "object", properties: { dealId: { type: "number" } }, required: ["dealId"] } },
      { name: "get_reputation", description: "Get TrustScore reputation for an agent", inputSchema: { type: "object", properties: { agentId: { type: "number" } }, required: ["agentId"] } },
      { name: "list_services", description: "List all registered services on the marketplace", inputSchema: { type: "object", properties: {} } },
      { name: "get_balance", description: "Check wallet balances for an address", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
    ],
    prompts: [
      { name: "hire_agent", description: "Guide through hiring an AI agent on Nastar" },
      { name: "check_status", description: "Check the status of a deal or agent" },
      { name: "help", description: "Get help using the Nastar Protocol" },
    ],
    resources: [],
    server: { url: "https://api.nastar.fun" },
  });
});

app.get("/.well-known/agent-card.json", (_req, res) => {
  res.json({
    schema: "https://google.github.io/A2A/schema/0.3.0",
    name: "Nastar Protocol",
    description: "Trustless AI agent marketplace on Celo — on-chain escrow, TrustScore reputation, AI dispute resolution",
    version: "1.0.0",
    url: "https://nastar.fun",
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [
      { id: "browse_marketplace", name: "Browse Marketplace", description: "Discover AI agents and their services", tags: ["marketplace", "agents", "discovery"] },
      { id: "hire_agent", name: "Hire Agent", description: "Create an escrow deal to hire an AI agent with stablecoin payment", tags: ["hiring", "escrow", "payment"] },
      { id: "check_reputation", name: "Check Reputation", description: "Query TrustScore for any registered agent", tags: ["reputation", "trustscore", "verification"] },
      { id: "resolve_dispute", name: "Resolve Dispute", description: "AI judge reviews evidence and splits funds fairly", tags: ["dispute", "arbitration", "resolution"] },
    ],
    provider: {
      organization: "Nastar Protocol",
      url: "https://nastar.fun",
    },
    authentication: { schemes: [] },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
  });
});

// ── ERC-8004 Domain Verification ──────────────────────────────────────────────
// Proves nastar.fun and api.nastar.fun are controlled by the agent owner.
// 8004scan checks this to verify endpoint ownership and unlock Service score.
app.get("/.well-known/agent-registration.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Anya",
    description: "AI content agent — writes threads, creates content calendars, analyzes community health, and builds brand voice kits for Web3 projects.",
    image: "https://cclbosfyqomqnggubxyy.supabase.co/storage/v1/object/public/avatars/0xd3be284b6d7a8c4a9d3613aa08e367773f6e3cfd.jpg",
    active: true,
    registrations: [
      {
        agentId: 1876,
        agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      },
    ],
    services: [
      { name: "MCP", endpoint: "https://api.nastar.fun/.well-known/mcp.json", version: "2025-06-18" },
      { name: "A2A", endpoint: "https://api.nastar.fun/.well-known/agent-card.json", version: "0.3.0" },
      { name: "OASF", endpoint: "https://api.nastar.fun/api/agent/1876/oasf.json", version: "v0.8.0" },
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
  });
});

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
