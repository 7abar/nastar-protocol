"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { getStoredAgents, type RegisteredAgent } from "@/lib/agents-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

interface AgentDisplay {
  agentId: string;
  name: string;
  description: string;
  walletAddress: string;
  price: string;
  serviceCount: number;
  active: boolean;
  revenue: string;
  jobsCompleted: number;
  hasApiKey: boolean;
  isOwner: boolean;
  localId?: string;
}

export default function AgentsPage() {
  const { user } = usePrivy();
  const [agents, setAgents] = useState<AgentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "mine">("all");

  useEffect(() => {
    async function load() {
      try {
        const [servicesRes, lbRes] = await Promise.all([
          fetch(`${API_URL}/v1/services`),
          fetch(`${API_URL}/v1/leaderboard`),
        ]);
        const services = await servicesRes.json();
        const leaderboard = await lbRes.json();
        const lbMap = new Map<number, any>();
        leaderboard.forEach((a: any) => lbMap.set(a.agentId, a));

        const localAgents = getStoredAgents();
        const localMap = new Map<string, RegisteredAgent>();
        localAgents.forEach((a) => localMap.set(a.agentWallet.toLowerCase(), a));

        const ownerAddr = user?.wallet?.address?.toLowerCase() || "";

        // Group by agentId
        const agentMap = new Map<string, AgentDisplay>();

        for (const svc of services) {
          const key = String(svc.agentId);
          const local = localMap.get(svc.provider?.toLowerCase());
          const lb = lbMap.get(svc.agentId);

          if (agentMap.has(key)) {
            agentMap.get(key)!.serviceCount++;
            continue;
          }

          agentMap.set(key, {
            agentId: key,
            name: local?.name || svc.name,
            description: svc.description,
            walletAddress: svc.provider,
            price: svc.pricePerCall,
            serviceCount: 1,
            active: svc.active,
            revenue: lb?.revenue || "0",
            jobsCompleted: lb?.jobsCompleted || 0,
            hasApiKey: local?.apiKeyActive || false,
            isOwner: local?.ownerAddress?.toLowerCase() === ownerAddr,
            localId: local?.id,
          });
        }

        // Add local-only agents
        for (const local of localAgents) {
          const exists = [...agentMap.values()].some(
            (a) => a.walletAddress.toLowerCase() === local.agentWallet.toLowerCase()
          );
          if (!exists) {
            agentMap.set(`local-${local.id}`, {
              agentId: local.agentNftId?.toString() || "pending",
              name: local.name,
              description: local.description,
              walletAddress: local.agentWallet,
              price: local.pricePerCall,
              serviceCount: local.serviceId ? 1 : 0,
              active: false,
              revenue: "0",
              jobsCompleted: 0,
              hasApiKey: local.apiKeyActive,
              isOwner: local.ownerAddress.toLowerCase() === ownerAddr,
              localId: local.id,
            });
          }
        }

        setAgents([...agentMap.values()]);
      } catch (err) {
        console.error("Failed to load agents:", err);
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [user]);

  const filtered = agents.filter((a) => {
    if (filter === "active" && !a.active) return false;
    if (filter === "mine" && !a.isOwner) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.walletAddress.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10 bg-black/80 backdrop-blur-xl sticky top-16 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Agent Explorer</h1>
              <p className="text-white/40 text-sm mt-1">
                {agents.length} registered agent{agents.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Link
              href="/agents/register"
              className="px-4 py-2 rounded-lg bg-green-500 text-black font-medium hover:bg-green-400 transition text-sm"
            >
              + Register Agent
            </Link>
          </div>
          <div className="flex gap-3 mt-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents, services, addresses..."
              className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50 text-sm"
            />
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(["all", "active", "mine"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-sm capitalize transition ${
                    filter === f
                      ? "bg-green-500/20 text-green-400"
                      : "bg-white/5 text-white/50 hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-20 text-white/30 animate-pulse">Loading agents...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/30 mb-4">No agents found</p>
            <Link href="/agents/register" className="text-green-400 hover:underline">Register the first one</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((agent) => (
              <Link
                key={agent.agentId + agent.walletAddress}
                href={agent.localId ? `/agents/${agent.localId}` : `/agents/${agent.agentId}`}
                className="block p-4 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/30 transition group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-lg">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-green-400 transition">
                        Agent #{agent.agentId}
                      </h3>
                      <p className="text-white/30 text-xs font-mono">
                        {agent.walletAddress.slice(0, 6)}...{agent.walletAddress.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${agent.active ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/30"}`}>
                    {agent.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="text-white/50 text-sm line-clamp-2 mb-3">{agent.description}</p>

                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-white/40">
                    {agent.serviceCount} service{agent.serviceCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-green-400 font-medium">from {agent.price} USDC</span>
                </div>

                {/* Stats bar */}
                <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs">
                  <span className="text-green-400 font-medium">${agent.revenue} earned</span>
                  <span className="text-white/30">{agent.jobsCompleted} jobs done</span>
                  {agent.hasApiKey && (
                    <span className="text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      API
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
