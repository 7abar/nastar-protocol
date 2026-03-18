/**
 * Chain Indexer — polls Celo Mainnet for events and caches data in memory.
 * Provides real-time stats, agent leaderboard, and recent jobs.
 */

import { publicClient, serialize } from "./client.js";
import { CONTRACTS } from "../config.js";
import { SERVICE_REGISTRY_ABI, NASTAR_ESCROW_ABI as ESCROW_ABI } from "../abis.js";
import { formatUnits, parseAbiItem } from "viem";

// ── Types ────────────────────────────────────────────────────────────────────

export interface IndexedService {
  serviceId: number;
  agentId: number;
  provider: string;
  name: string;
  description: string;
  endpoint: string;
  paymentToken: string;
  pricePerCall: string;
  active: boolean;
  createdAt: number;
}

export interface IndexedDeal {
  dealId: number;
  serviceId: number;
  buyerAgentId: number;
  sellerAgentId: number;
  buyer: string;
  seller: string;
  paymentToken: string;
  amount: string;
  amountRaw: bigint;
  taskDescription: string;
  deliveryProof: string;
  status: number;
  statusLabel: string;
  createdAt: number;
  deadline: number;
  completedAt: number;
  disputedAt: number;
  autoConfirm: boolean;
}

export interface AgentStats {
  agentId: number;
  name: string;
  address: string;
  revenue: bigint;
  revenueFormatted: string;
  jobsCompleted: number;
  jobsTotal: number;
  jobsDisputed: number;
  completionRate: number;
}

export interface MarketStats {
  totalRevenue: string;
  totalRevenueRaw: bigint;
  totalDeals: number;
  totalCompletedDeals: number;
  totalActiveServices: number;
  totalAgents: number;
  recentDeals: IndexedDeal[];
  lastUpdated: string;
  lastBlock: number;
}

// ── State ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<number, string> = {
  0: "Created", 1: "Accepted", 2: "Delivered", 3: "Completed",
  4: "Disputed", 5: "Refunded", 6: "Expired", 7: "Resolved",
};

let services: IndexedService[] = [];
let deals: IndexedDeal[] = [];
let stats: MarketStats = {
  totalRevenue: "0", totalRevenueRaw: 0n,
  totalDeals: 0, totalCompletedDeals: 0,
  totalActiveServices: 0, totalAgents: 0,
  recentDeals: [], lastUpdated: new Date().toISOString(), lastBlock: 0,
};
let leaderboard: AgentStats[] = [];
let lastIndexedBlock = 0n;
let indexing = false;

// ── Getters ──────────────────────────────────────────────────────────────────

export function getServices() { return services; }
export function getDeals() { return deals; }
export function getStats() { return stats; }
export function getLeaderboard() { return leaderboard; }

export function getServiceById(id: number) {
  return services.find(s => s.serviceId === id);
}

export function getDealById(id: number) {
  return deals.find(d => d.dealId === id);
}

export function getDealsByAgent(agentId: number) {
  return deals.filter(d => d.buyerAgentId === agentId || d.sellerAgentId === agentId);
}

export function getOpenBounties() {
  const now = Math.floor(Date.now() / 1000);
  return deals.filter(d => d.status === 0 && d.deadline > now);
}

// ── Indexer ──────────────────────────────────────────────────────────────────

async function fetchAllServices(): Promise<IndexedService[]> {
  try {
    const [result] = await publicClient.readContract({
      address: CONTRACTS.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getActiveServices",
      args: [0n, 200n],
    }) as [any[], bigint];

    return result.map((s: any, i: number) => ({
      serviceId: i,
      agentId: Number(s.agentId),
      provider: s.provider,
      name: s.name,
      description: s.description,
      endpoint: s.endpoint,
      paymentToken: s.paymentToken,
      pricePerCall: formatUnits(s.pricePerCall, 18),
      active: s.active,
      createdAt: Number(s.createdAt),
    }));
  } catch (err) {
    console.error("Failed to fetch services:", err);
    return services; // keep old data
  }
}

async function fetchAllDeals(): Promise<IndexedDeal[]> {
  try {
    const nextDealId = await publicClient.readContract({
      address: CONTRACTS.NASTAR_ESCROW,
      abi: ESCROW_ABI,
      functionName: "nextDealId",
    }) as bigint;

    const total = Number(nextDealId);
    const indexed: IndexedDeal[] = [];

    for (let i = 0; i < total; i++) {
      try {
        const deal = await publicClient.readContract({
          address: CONTRACTS.NASTAR_ESCROW,
          abi: ESCROW_ABI,
          functionName: "getDeal",
          args: [BigInt(i)],
        }) as any;

        indexed.push({
          dealId: i,
          serviceId: Number(deal.serviceId),
          buyerAgentId: Number(deal.buyerAgentId),
          sellerAgentId: Number(deal.sellerAgentId),
          buyer: deal.buyer,
          seller: deal.seller,
          paymentToken: deal.paymentToken,
          amount: formatUnits(deal.amount, 18),
          amountRaw: deal.amount,
          taskDescription: deal.taskDescription,
          deliveryProof: deal.deliveryProof || "",
          status: Number(deal.status),
          statusLabel: STATUS_LABELS[Number(deal.status)] || "Unknown",
          createdAt: Number(deal.createdAt),
          deadline: Number(deal.deadline),
          completedAt: Number(deal.completedAt),
          disputedAt: Number(deal.disputedAt),
          autoConfirm: deal.autoConfirm || false,
        });
      } catch {}
    }

    return indexed;
  } catch (err) {
    console.error("Failed to fetch deals:", err);
    return deals;
  }
}

async function computeStats() {
  let totalRevenue = 0n;
  let totalCompleted = 0;
  const agentMap = new Map<number, AgentStats>();

  // Build agent stats from services
  for (const svc of services) {
    if (!agentMap.has(svc.agentId)) {
      agentMap.set(svc.agentId, {
        agentId: svc.agentId,
        name: svc.name,
        address: svc.provider,
        revenue: 0n,
        revenueFormatted: "0",
        jobsCompleted: 0,
        jobsTotal: 0,
        jobsDisputed: 0,
        completionRate: 0,
      });
    }
  }

  // Aggregate on-chain deal data
  for (const deal of deals) {
    const key = deal.sellerAgentId;
    if (!agentMap.has(key)) {
      agentMap.set(key, {
        agentId: key,
        name: `Agent #${key}`,
        address: deal.seller,
        revenue: 0n,
        revenueFormatted: "0",
        jobsCompleted: 0,
        jobsTotal: 0,
        jobsDisputed: 0,
        completionRate: 0,
      });
    }

    const agent = agentMap.get(key)!;
    agent.jobsTotal++;

    if (deal.status === 3 || deal.status === 7) {
      agent.jobsCompleted++;
      agent.revenue += deal.amountRaw;
      totalRevenue += deal.amountRaw;
      totalCompleted++;
    }
    if (deal.status === 4) {
      agent.jobsDisputed++;
    }
  }

  // Compute rates + format
  for (const agent of agentMap.values()) {
    agent.revenueFormatted = formatUnits(agent.revenue, 18);
    agent.completionRate = agent.jobsTotal > 0
      ? Math.round((agent.jobsCompleted / agent.jobsTotal) * 100)
      : 0;
  }

  // Sort leaderboard — show all registered agents, not just those with deals
  leaderboard = [...agentMap.values()]
    .sort((a, b) => {
      // Primary: revenue (descending)
      if (a.revenue !== b.revenue) return a.revenue > b.revenue ? -1 : 1;
      // Secondary: jobs completed
      if (a.jobsCompleted !== b.jobsCompleted) return b.jobsCompleted - a.jobsCompleted;
      // Tertiary: name
      return a.name.localeCompare(b.name);
    });

  // Unique agents
  const uniqueAgents = new Set<number>();
  services.forEach(s => uniqueAgents.add(s.agentId));
  deals.forEach(d => {
    uniqueAgents.add(d.buyerAgentId);
    uniqueAgents.add(d.sellerAgentId);
  });

  stats = {
    totalRevenue: formatUnits(totalRevenue, 18),
    totalRevenueRaw: totalRevenue,
    totalDeals: deals.length,
    totalCompletedDeals: totalCompleted,
    totalActiveServices: services.filter(s => s.active).length,
    totalAgents: uniqueAgents.size,
    recentDeals: [...deals].reverse().slice(0, 10),
    lastUpdated: new Date().toISOString(),
    lastBlock: Number(lastIndexedBlock),
  };
}

export async function runIndex() {
  if (indexing) return;
  indexing = true;

  try {
    const block = await publicClient.getBlockNumber();
    lastIndexedBlock = block;

    services = await fetchAllServices();
    deals = await fetchAllDeals();
    await computeStats();

    console.log(`[indexer] Block ${block} | ${services.length} services | ${deals.length} deals | $${stats.totalRevenue} revenue`);
  } catch (err) {
    console.error("[indexer] Error:", err);
  }

  indexing = false;
}

// Poll every 10 seconds
export function startIndexer() {
  console.log("[indexer] Starting chain indexer (10s interval)...");
  runIndex(); // first run immediately
  setInterval(runIndex, 10_000);
}
