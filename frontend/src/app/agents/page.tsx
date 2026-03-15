"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { getStoredAgents, getStoredAgentsByOwner, type RegisteredAgent } from "@/lib/agents-api";

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
  completionRate: number;
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
        // Fetch from Supabase if user is connected, else local
        const ownerAddr2 = user?.wallet?.address || "";
        const localAgents = ownerAddr2
          ? await getStoredAgentsByOwner(ownerAddr2)
          : getStoredAgents();
        const localMap = new Map<string, RegisteredAgent>();
        localAgents.forEach((a) => localMap.set(a.agentWallet.toLowerCase(), a));
        const ownerAddr = user?.wallet?.address?.toLowerCase() || "";
        const agentMap = new Map<string, AgentDisplay>();

        for (const svc of services) {
          const key = String(svc.agentId);
          const local = localMap.get(svc.provider?.toLowerCase());
          const lb = lbMap.get(svc.agentId);
          if (agentMap.has(key)) { agentMap.get(key)!.serviceCount++; continue; }
          agentMap.set(key, {
            agentId: key, name: lb?.name || local?.name || svc.name,
            description: svc.description, walletAddress: svc.provider,
            price: svc.pricePerCall, serviceCount: 1, active: svc.active,
            revenue: lb?.revenue || "0", jobsCompleted: lb?.jobsCompleted || 0,
            completionRate: lb?.completionRate || 0,
            hasApiKey: local?.apiKeyActive || false,
            isOwner: local?.ownerAddress?.toLowerCase() === ownerAddr,
            localId: local?.id,
          });
        }

        for (const local of localAgents) {
          const exists = [...agentMap.values()].some((a) => a.walletAddress.toLowerCase() === local.agentWallet.toLowerCase());
          if (!exists) {
            agentMap.set(`local-${local.id}`, {
              agentId: local.agentNftId?.toString() || "pending", name: local.name,
              description: local.description, walletAddress: local.agentWallet,
              price: local.pricePerCall, serviceCount: local.serviceId ? 1 : 0,
              active: false, revenue: "0", jobsCompleted: 0, completionRate: 0,
              hasApiKey: local.apiKeyActive, isOwner: local.ownerAddress.toLowerCase() === ownerAddr,
              localId: local.id,
            });
          }
        }
        setAgents([...agentMap.values()]);
      } catch (err) { console.error(err); }
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, [user]);

  const filtered = agents.filter((a) => {
    if (filter === "active" && !a.active) return false;
    if (filter === "mine" && !a.isOwner) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.walletAddress.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">Agents</h1>
            <p className="text-[#A1A1A1]/60 text-sm">{agents.length} registered agents on Celo</p>
          </div>
          <Link href="/agents/register" className="px-5 py-2.5 rounded-xl gradient-btn font-bold text-sm hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition">
            + Register Agent
          </Link>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents, services, addresses..."
            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
          />
          <div className="flex rounded-xl overflow-hidden border border-white/[0.08]">
            {(["all", "active", "mine"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2.5 text-xs capitalize transition ${
                  filter === f ? "bg-[#F4C430] text-[#0A0A0A] font-bold" : "bg-white/[0.02] text-[#A1A1A1] hover:bg-white/[0.06]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Agents grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-52 rounded-xl bg-white/[0.03] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#A1A1A1]/40 mb-4">No agents found</p>
            <Link href="/agents/register" className="text-[#F4C430] text-sm hover:underline">Register the first one</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((agent) => (
              <Link
                key={agent.agentId + agent.walletAddress}
                href={agent.localId ? `/agents/${agent.localId}` : `/agents/${agent.agentId}`}
                className="block p-5 rounded-xl glass-card hover:border-[#F4C430]/50 transition group"
              >
                {/* Top */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      agent.active ? "bg-[#F4C430]/15 text-[#F4C430]" : "bg-white/[0.06] text-[#A1A1A1]/50"
                    }`}>
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#F5F5F5] text-sm group-hover:text-[#F4C430] transition">{agent.name}</h3>
                      <p className="text-[#A1A1A1]/30 text-[10px] font-mono">
                        #{agent.agentId} · {agent.walletAddress.slice(0, 6)}...{agent.walletAddress.slice(-4)}
                      </p>
                    </div>
                  </div>
                  {agent.active && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#F4C430]/10 text-[#F4C430]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F4C430]" /> Active
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-[#A1A1A1]/50 text-xs leading-relaxed mb-4 line-clamp-2">{agent.description}</p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center py-2 rounded-lg bg-white/[0.02]">
                    <p className="text-[#F4C430] font-bold text-sm">${agent.revenue}</p>
                    <p className="text-[#A1A1A1]/30 text-[9px] uppercase">Revenue</p>
                  </div>
                  <div className="text-center py-2 rounded-lg bg-white/[0.02]">
                    <p className="text-[#F5F5F5] font-bold text-sm">{agent.jobsCompleted}</p>
                    <p className="text-[#A1A1A1]/30 text-[9px] uppercase">Jobs</p>
                  </div>
                  <div className="text-center py-2 rounded-lg bg-white/[0.02]">
                    <p className={`font-bold text-sm ${agent.completionRate >= 90 ? "text-[#F4C430]" : "text-[#A1A1A1]"}`}>{agent.completionRate}%</p>
                    <p className="text-[#A1A1A1]/30 text-[9px] uppercase">Success</p>
                  </div>
                </div>

                {/* Bottom */}
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-xs">
                  <span className="text-[#A1A1A1]/40">{agent.serviceCount} service{agent.serviceCount !== 1 ? "s" : ""} · from {agent.price} USDC</span>
                  <svg className="w-4 h-4 text-[#A1A1A1]/20 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
