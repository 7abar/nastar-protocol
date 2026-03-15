"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

// Generate unique avatar style per agent
const AGENT_AVATARS: { gradient: string; icon: string }[] = [
  { gradient: "from-blue-500 to-cyan-400", icon: "🔍" },
  { gradient: "from-purple-500 to-pink-400", icon: "🌐" },
  { gradient: "from-green-500 to-emerald-400", icon: "🛡️" },
  { gradient: "from-orange-500 to-amber-400", icon: "📊" },
  { gradient: "from-red-500 to-rose-400", icon: "⚡" },
  { gradient: "from-indigo-500 to-violet-400", icon: "🤖" },
  { gradient: "from-teal-500 to-green-400", icon: "💬" },
  { gradient: "from-fuchsia-500 to-purple-400", icon: "🧠" },
];

function getAgentAvatar(agentId: string) {
  const idx = parseInt(agentId) % AGENT_AVATARS.length;
  return AGENT_AVATARS[idx];
}

function getServiceIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("research") || n.includes("web")) return "🔍";
  if (n.includes("translat") || n.includes("language")) return "🌐";
  if (n.includes("code") || n.includes("solidity") || n.includes("review")) return "🛡️";
  if (n.includes("data") || n.includes("analy")) return "📊";
  if (n.includes("trade") || n.includes("swap")) return "⚡";
  if (n.includes("social") || n.includes("tweet")) return "💬";
  return "🤖";
}

interface ServiceItem {
  serviceId: number;
  agentId: string;
  name: string;
  description: string;
  endpoint: string;
  provider: string;
  pricePerCall: string;
  active: boolean;
}

interface AgentItem {
  agentId: string;
  provider: string;
  serviceCount: number;
  services: string[];
  totalVolume: string;
}

const CATEGORIES = [
  { key: "all", label: "All", icon: "grid" },
  { key: "data", label: "Data", icon: "chart" },
  { key: "security", label: "Security", icon: "shield" },
  { key: "nft", label: "NFT", icon: "image" },
  { key: "social", label: "Social", icon: "chat" },
  { key: "defi", label: "DeFi", icon: "swap" },
  { key: "analytics", label: "Analytics", icon: "search" },
];

function matchCategory(name: string, desc: string, cat: string): boolean {
  if (cat === "all") return true;
  const text = `${name} ${desc}`.toLowerCase();
  const map: Record<string, string[]> = {
    data: ["data", "feed", "price", "metric"],
    security: ["audit", "security", "vulnerability", "solidity", "code review"],
    nft: ["nft", "mint", "token", "erc721"],
    social: ["tweet", "social", "compose", "content", "write"],
    defi: ["swap", "dex", "route", "defi", "liquidity"],
    analytics: ["analy", "chain", "scrap", "web", "extract", "translat", "research"],
  };
  return (map[cat] || []).some((kw) => text.includes(kw));
}

function formatPrice(raw: string): string {
  try {
    const val = parseFloat(formatUnits(BigInt(raw), 18));
    return val % 1 === 0 ? val.toFixed(0) : val.toFixed(2);
  } catch {
    return raw;
  }
}

function CategoryIcon({ type }: { type: string }) {
  const cls = "w-4 h-4";
  switch (type) {
    case "chart": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
    case "shield": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>;
    case "image": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5" /></svg>;
    case "chat": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>;
    case "swap": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>;
    case "search": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
    default: return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>;
  }
}

export default function OfferingsPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tab, setTab] = useState<"offerings" | "agents">("offerings");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/services`);
        const data = await res.json();
        setServices(data.services || data || []);
      } catch {}
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  // Derive agents from services
  const agentMap = new Map<string, AgentItem>();
  for (const svc of services) {
    const id = svc.agentId;
    if (!agentMap.has(id)) {
      agentMap.set(id, {
        agentId: id,
        provider: svc.provider,
        serviceCount: 0,
        services: [],
        totalVolume: "0",
      });
    }
    const a = agentMap.get(id)!;
    a.serviceCount++;
    a.services.push(svc.name);
  }
  const agents = Array.from(agentMap.values());

  const filtered = services.filter((s) => {
    if (!matchCategory(s.name, s.description, category)) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredAgents = agents.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.services.some((s) => s.toLowerCase().includes(q)) || a.provider.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header + Tabs */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Browse</h1>
          <p className="text-[#A1A1A1]/60 text-sm">
            {services.length} services across {agents.length} agents
          </p>
        </div>

        {/* Tabs: Offerings | Agents */}
        <div className="flex gap-0 mb-6 border-b border-white/[0.06]">
          <button
            onClick={() => setTab("offerings")}
            className={`px-5 py-3 text-sm font-medium transition border-b-2 -mb-px ${
              tab === "offerings"
                ? "text-[#F4C430] border-[#F4C430]"
                : "text-[#A1A1A1]/50 border-transparent hover:text-[#F5F5F5]"
            }`}
          >
            Offerings
          </button>
          <button
            onClick={() => setTab("agents")}
            className={`px-5 py-3 text-sm font-medium transition border-b-2 -mb-px ${
              tab === "agents"
                ? "text-[#F4C430] border-[#F4C430]"
                : "text-[#A1A1A1]/50 border-transparent hover:text-[#F5F5F5]"
            }`}
          >
            Agents
          </button>
        </div>

        {/* Search */}
        <div className="mb-6 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "offerings" ? "Search services..." : "Search agents..."}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
          />

          {/* Category filter (only for Offerings tab) */}
          {tab === "offerings" && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition ${
                    category === cat.key
                      ? "bg-[#F4C430] text-[#0A0A0A] font-bold"
                      : "bg-white/[0.04] text-[#A1A1A1] hover:bg-white/[0.08]"
                  }`}
                >
                  <CategoryIcon type={cat.icon} />
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Offerings Tab ──────────────────────────────────────── */}
        {tab === "offerings" && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-44 rounded-xl bg-white/[0.03] animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[#A1A1A1]/40 mb-2">{search ? "No services match your search" : "No services in this category"}</p>
                {search && <button onClick={() => setSearch("")} className="text-[#F4C430] text-sm hover:underline">Clear search</button>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((svc, idx) => (
                  <div key={idx} className="p-5 rounded-xl glass-card hover:border-[#F4C430]/50 transition group flex flex-col">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F4C430]/20 to-[#FF9F1C]/10 flex items-center justify-center text-lg shrink-0">
                          {getServiceIcon(svc.name)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-[#F5F5F5] text-sm group-hover:text-[#F4C430] transition">{svc.name}</h3>
                          <p className="text-[#A1A1A1]/30 text-[10px] font-mono">Agent #{svc.agentId}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-[#A1A1A1]/60 text-xs leading-relaxed flex-1 mb-4 line-clamp-3">{svc.description}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                      <span className="text-[#F4C430] font-semibold text-sm">{formatPrice(svc.pricePerCall)} USDC</span>
                      <Link
                        href={`/chat?agent=${svc.agentId}&name=${encodeURIComponent(svc.name)}`}
                        className="px-4 py-1.5 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_10px_rgba(244,196,48,0.3)] transition"
                      >
                        Hire
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Agents Tab ─────────────────────────────────────────── */}
        {tab === "agents" && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />)}
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[#A1A1A1]/40">No agents found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAgents.map((agent) => {
                  const agentServices = services.filter((s) => s.agentId === agent.agentId);
                  const minPrice = agentServices.length > 0
                    ? Math.min(...agentServices.map((s) => parseFloat(formatUnits(BigInt(s.pricePerCall), 18))))
                    : 0;

                  const avatar = getAgentAvatar(agent.agentId);
                  const agentName = agent.services[0] || `Agent #${agent.agentId}`;

                  return (
                    <div key={agent.agentId} className="p-5 rounded-xl glass-card hover:border-[#F4C430]/50 transition group">
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatar.gradient} flex items-center justify-center shrink-0 shadow-lg`}>
                          <span className="text-xl">{avatar.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-[#F5F5F5] text-sm group-hover:text-[#F4C430] transition">{agentName}</h3>
                            <span className="px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 text-[10px] font-medium">Active</span>
                          </div>
                          <p className="text-[#A1A1A1]/40 text-[11px] font-mono truncate">{agent.provider.slice(0, 6)}...{agent.provider.slice(-4)}</p>
                        </div>
                      </div>

                      {/* Services offered by this agent */}
                      <div className="mb-4">
                        <p className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mb-2">Services ({agent.serviceCount})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.services.map((name, i) => (
                            <span key={i} className="px-2 py-0.5 rounded text-[11px] bg-white/[0.06] text-[#A1A1A1]/70">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="text-[#F4C430] font-semibold text-sm">from ${minPrice.toFixed(0)}</p>
                            <p className="text-[#A1A1A1]/30 text-[9px]">per task</p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Link
                            href={`/chat/${agent.agentId}`}
                            className="px-4 py-1.5 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_12px_rgba(244,196,48,0.3)] transition"
                          >
                            Chat
                          </Link>
                          <Link
                            href={`/profile/${agent.provider}`}
                            className="px-3 py-1.5 rounded-lg border border-white/[0.1] text-[#A1A1A1] text-xs hover:text-white hover:border-white/[0.2] transition"
                          >
                            Profile
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
