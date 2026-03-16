/**
 * Nastar Protocol MCP Server
 *
 * Exposes Nastar marketplace as MCP tools for AI agents.
 * Premium endpoints are automatically paid via x402 (Base Sepolia).
 *
 * Tools:
 *  - nastar_list_services      List active agent services
 *  - nastar_get_service        Get service details by ID
 *  - nastar_search_services    Full-text search (x402 gated, $0.001)
 *  - nastar_get_deal           Get deal by ID
 *  - nastar_agent_deals        All deals for an agent
 *  - nastar_get_reputation     Agent reputation + TrustScore
 *  - nastar_leaderboard        Top agents by reputation
 *  - nastar_market_stats       Marketplace-wide analytics (x402 gated, $0.001)
 *  - nastar_request_judge      Submit evidence to AI dispute judge
 *  - nastar_get_verdict        Check judge verdict for a deal
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { wrapAxiosWithPayment, x402Client } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";
import { config } from "dotenv";

config();

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = process.env.NASTAR_API_URL || "https://api.nastar.fun";
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;

if (!EVM_PRIVATE_KEY) {
  console.error("[Nastar MCP] WARNING: EVM_PRIVATE_KEY not set — x402 premium endpoints will fail");
}

// ─── HTTP client with x402 auto-pay ──────────────────────────────────────────

async function createApiClient() {
  const baseClient = axios.create({ baseURL: API_URL, timeout: 15000 });

  if (!EVM_PRIVATE_KEY) return baseClient;

  const account = privateKeyToAccount(EVM_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
  const signer = toClientEvmSigner(account, publicClient);
  const x402 = new x402Client();
  x402.register("eip155:*", new ExactEvmScheme(signer));

  return wrapAxiosWithPayment(baseClient, x402);
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

async function main() {
  const api = await createApiClient();

  const server = new McpServer({
    name: "Nastar Protocol",
    version: "1.0.0",
  });

  // ── nastar_list_services ────────────────────────────────────────────────────
  server.tool(
    "nastar_list_services",
    "List active agent services on the Nastar marketplace. Returns service IDs, names, prices, and provider info.",
    {
      offset: z.number().optional().describe("Pagination offset (default 0)"),
      limit: z.number().optional().describe("Results per page, max 100 (default 20)"),
    },
    async ({ offset = 0, limit = 20 }) => {
      const res = await api.get(`/services?offset=${offset}&limit=${limit}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_get_service ──────────────────────────────────────────────────────
  server.tool(
    "nastar_get_service",
    "Get full details for a specific agent service by ID, including price, endpoint, and payment token.",
    {
      serviceId: z.number().describe("Service ID from the registry"),
    },
    async ({ serviceId }) => {
      const res = await api.get(`/services/${serviceId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_search_services (x402 gated) ─────────────────────────────────────
  server.tool(
    "nastar_search_services",
    "Search agent services by keyword. COSTS $0.001 (auto-paid via x402 on Base Sepolia). Returns matching services ranked by relevance.",
    {
      query: z.string().describe("Search keywords, e.g. 'translation', 'research celo', 'data analysis'"),
    },
    async ({ query }) => {
      const res = await api.get(`/services/search/query?q=${encodeURIComponent(query)}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_get_deal ─────────────────────────────────────────────────────────
  server.tool(
    "nastar_get_deal",
    "Get deal details by ID. Returns buyer/seller, amount, status, task description, and delivery proof.",
    {
      dealId: z.number().describe("Deal ID from the escrow contract"),
    },
    async ({ dealId }) => {
      const res = await api.get(`/deals/${dealId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_agent_deals ──────────────────────────────────────────────────────
  server.tool(
    "nastar_agent_deals",
    "Get all deals for an agent (as buyer and seller). Includes reputation stats: completion rate, dispute rate, total volume.",
    {
      agentId: z.number().describe("Agent NFT ID (ERC-8004)"),
    },
    async ({ agentId }) => {
      const res = await api.get(`/deals/agent/${agentId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_get_reputation ───────────────────────────────────────────────────
  server.tool(
    "nastar_get_reputation",
    "Get TrustScore and reputation profile for an agent. Score 0-100. Tiers: New/Bronze/Silver/Gold/Diamond.",
    {
      agentId: z.number().describe("Agent NFT ID to check reputation for"),
    },
    async ({ agentId }) => {
      const res = await api.get(`/v1/reputation/${agentId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_leaderboard ──────────────────────────────────────────────────────
  server.tool(
    "nastar_leaderboard",
    "Get the top 50 agents ranked by TrustScore. Useful for finding the most reliable agents to hire.",
    {},
    async () => {
      const res = await api.get("/v1/reputation/leaderboard");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_market_stats (x402 gated) ────────────────────────────────────────
  server.tool(
    "nastar_market_stats",
    "Get marketplace-wide analytics: total volume, deal counts by status, top services. COSTS $0.001 (auto-paid via x402).",
    {},
    async () => {
      const res = await api.get("/deals/analytics/summary");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_request_judge ────────────────────────────────────────────────────
  server.tool(
    "nastar_request_judge",
    "Submit evidence to the AI Dispute Judge for a disputed deal. Judge uses GPT-4o to allocate funds between buyer and seller.",
    {
      dealId: z.number().describe("Disputed deal ID"),
      role: z.enum(["buyer", "seller"]).describe("Your role in the dispute"),
      evidence: z.string().describe("Your evidence: what happened, what was delivered or not delivered"),
    },
    async ({ dealId, role, evidence }) => {
      const res = await api.post(`/v1/judge/${dealId}/request`, { role, evidence });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_get_verdict ──────────────────────────────────────────────────────
  server.tool(
    "nastar_get_verdict",
    "Check the AI judge verdict for a disputed deal. Returns status, evidence submitted, and on-chain resolution tx if executed.",
    {
      dealId: z.number().describe("Deal ID to check verdict for"),
    },
    async ({ dealId }) => {
      const res = await api.get(`/v1/judge/${dealId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_realtime_stats ───────────────────────────────────────────────────
  server.tool(
    "nastar_realtime_stats",
    "Get real-time marketplace stats from the chain indexer: total revenue, active services, recent deals.",
    {},
    async () => {
      const res = await api.get("/v1/stats");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_swap_quote ───────────────────────────────────────────────────────
  server.tool(
    "nastar_swap_quote",
    "Get a Mento Protocol swap quote between Celo stablecoins. Supported: USDm, EURm, BRLm, COPm, XOFm.",
    {
      from: z.string().describe("Input token symbol (USDm, EURm, BRLm, COPm, XOFm)"),
      to: z.string().describe("Output token symbol"),
      amount: z.string().describe("Amount to swap (e.g. '100')"),
    },
    async ({ from, to, amount }) => {
      const res = await api.get(`/v1/swap/quote?from=${from}&to=${to}&amountIn=${amount}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_swap_build ───────────────────────────────────────────────────────
  server.tool(
    "nastar_swap_build",
    "Build Mento swap transaction parameters. Returns approval + swap calldata ready to execute. Does NOT execute the swap.",
    {
      from: z.string().describe("Input token symbol (USDm, EURm, BRLm, COPm, XOFm)"),
      to: z.string().describe("Output token symbol"),
      amount: z.string().describe("Amount to swap"),
      recipient: z.string().describe("Wallet address to receive the output tokens"),
    },
    async ({ from, to, amount, recipient }) => {
      const res = await api.post("/v1/swap/build", { from, to, amountIn: amount, recipient });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_fx_rates ─────────────────────────────────────────────────────────
  server.tool(
    "nastar_fx_rates",
    "Get live FX rates for all Mento stablecoin pairs. Returns both Mento on-chain rates and Pyth real-world rates, plus divergence alerts.",
    {},
    async () => {
      const res = await api.get("/v1/oracle/rates");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_fx_rate ───────────────────────────────────────────────────────────
  server.tool(
    "nastar_fx_rate",
    "Get FX rate for a specific stablecoin pair (e.g. USDm/EURm). Returns on-chain Mento rate and Pyth real-world rate with divergence %.",
    {
      from: z.string().describe("From token symbol (e.g. USDm, EURm, BRLm, COPm, XOFm)"),
      to: z.string().describe("To token symbol"),
    },
    async ({ from, to }) => {
      const res = await api.get(`/v1/oracle/rates/${from}/${to}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_oracle_sources ─────────────────────────────────────────────────────
  server.tool(
    "nastar_oracle_sources",
    "Check oracle health: Pyth + Mento status, last update times, and divergence alerts for all pairs.",
    {},
    async () => {
      const res = await api.get("/v1/oracle/sources");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── nastar_swap_pairs ───────────────────────────────────────────────────────
  server.tool(
    "nastar_swap_pairs",
    "List all tradable Mento token pairs on Celo Sepolia.",
    {},
    async () => {
      const res = await api.get("/v1/swap/pairs");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ─── Connect ─────────────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[Nastar MCP] Server ready. Tools: 10 | API: " + API_URL);
}

main().catch((err) => {
  console.error("[Nastar MCP] Fatal:", err);
  process.exit(1);
});
