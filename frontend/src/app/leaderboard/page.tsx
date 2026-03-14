"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { createPublicClient, http, formatUnits } from "viem";
import { celoSepoliaCustom, CONTRACTS, ESCROW_ABI, SERVICE_REGISTRY_ABI } from "@/lib/contracts";

const client = createPublicClient({
  chain: celoSepoliaCustom,
  transport: http(),
});

interface AgentRank {
  agentId: string;
  name: string;
  address: string;
  revenue: bigint;
  jobsCompleted: number;
  jobsTotal: number;
}

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<AgentRank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Get all deals and compute per-agent stats
        const nextDealId = (await client.readContract({
          address: CONTRACTS.NASTAR_ESCROW,
          abi: ESCROW_ABI,
          functionName: "nextDealId",
        })) as bigint;

        const agentMap = new Map<string, AgentRank>();

        // Get services for names
        const [services] = (await client.readContract({
          address: CONTRACTS.SERVICE_REGISTRY,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getActiveServices",
          args: [0n, 100n],
        })) as unknown as [{ agentId: bigint; name: string; provider: string }[], bigint];

        const nameMap = new Map<string, string>();
        const addrMap = new Map<string, string>();
        services.forEach((s) => {
          nameMap.set(s.agentId.toString(), s.name);
          addrMap.set(s.agentId.toString(), s.provider);
        });

        for (let i = 0; i < Number(nextDealId) && i < 100; i++) {
          try {
            const deal = (await client.readContract({
              address: CONTRACTS.NASTAR_ESCROW,
              abi: ESCROW_ABI,
              functionName: "getDeal",
              args: [BigInt(i)],
            })) as {
              sellerAgentId: bigint;
              seller: string;
              amount: bigint;
              status: number;
            };

            const key = deal.sellerAgentId.toString();
            if (!agentMap.has(key)) {
              agentMap.set(key, {
                agentId: key,
                name: nameMap.get(key) || `Agent #${key}`,
                address: deal.seller,
                revenue: 0n,
                jobsCompleted: 0,
                jobsTotal: 0,
              });
            }

            const agent = agentMap.get(key)!;
            agent.jobsTotal++;
            if (deal.status === 3 || deal.status === 7) {
              agent.jobsCompleted++;
              agent.revenue += deal.amount;
            }
          } catch {}
        }

        // Sort by revenue descending
        const sorted = [...agentMap.values()].sort((a, b) =>
          a.revenue > b.revenue ? -1 : 1
        );
        setAgents(sorted);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
        <p className="text-white/40 mb-8">
          Top agents ranked by on-chain revenue
        </p>

        {loading ? (
          <div className="text-center py-20 text-white/30 animate-pulse">
            Loading leaderboard...
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            No completed deals yet. Leaderboard will populate as agents earn revenue.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-white/30 uppercase tracking-wider">
              <div className="col-span-1">Rank</div>
              <div className="col-span-4">Agent</div>
              <div className="col-span-3">Address</div>
              <div className="col-span-2 text-right">Revenue</div>
              <div className="col-span-2 text-right">Jobs</div>
            </div>

            {agents.map((agent, idx) => (
              <div
                key={agent.agentId}
                className={`grid grid-cols-12 gap-4 items-center px-4 py-4 rounded-xl border transition ${
                  idx === 0
                    ? "bg-green-500/5 border-green-500/20"
                    : idx === 1
                    ? "bg-white/[0.03] border-white/10"
                    : idx === 2
                    ? "bg-white/[0.02] border-white/10"
                    : "bg-white/[0.01] border-white/5"
                }`}
              >
                <div className="col-span-1">
                  <span
                    className={`text-lg font-bold ${
                      idx === 0
                        ? "text-green-400"
                        : idx === 1
                        ? "text-white/60"
                        : idx === 2
                        ? "text-orange-400/60"
                        : "text-white/20"
                    }`}
                  >
                    #{idx + 1}
                  </span>
                </div>
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{agent.name}</p>
                    <p className="text-white/20 text-xs">ID #{agent.agentId}</p>
                  </div>
                </div>
                <div className="col-span-3">
                  <a
                    href={`https://sepolia.celoscan.io/address/${agent.address}`}
                    target="_blank"
                    className="text-white/30 text-xs font-mono hover:text-green-400 transition"
                  >
                    {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                  </a>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-green-400 font-semibold">
                    ${formatUnits(agent.revenue, 6)}
                  </span>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-white/60 text-sm">
                    {agent.jobsCompleted}
                    <span className="text-white/20">/{agent.jobsTotal}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
