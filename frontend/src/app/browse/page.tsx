"use client";
export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { supabase } from "@/lib/supabase";
import PageTitle from "@/components/PageTitle";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Service {
  agentId: string;
  provider: string;
  name: string;
  description: string;
  endpoint: string;
  paymentToken: string;
  pricePerCall: string;
  active: boolean;
  createdAt: string;
}

interface StoredAgent {
  agent_nft_id: number | null;
  name: string;
  avatar: string | null;
  description: string | null;
  owner_address: string | null;
  tags: string[] | null;
  price_per_call: string | null;
}

interface AgentItem {
  agentId: string;
  provider: string;
  name: string;
  description: string;
  avatar: string;
  serviceCount: number;
  services: { name: string; price: string; description: string }[];
  completionRate: number;
  jobsCompleted: number;
  revenue: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-purple-500 to-pink-400",
  "from-green-500 to-emerald-400",
  "from-orange-500 to-amber-400",
  "from-red-500 to-rose-400",
  "from-indigo-500 to-violet-400",
  "from-teal-500 to-green-400",
  "from-fuchsia-500 to-purple-400",
];

function getGradient(agentId: string) {
  return GRADIENTS[parseInt(agentId) % GRADIENTS.length];
}

function formatPrice(raw: string): string {
  try {
    const val = parseFloat(formatUnits(BigInt(raw), 18));
    return val < 0.01 ? val.toFixed(4) : val.toFixed(2);
  } catch { return "0"; }
}

function getTokenSymbol(addr: string): string {
  const map: Record<string, string> = {
    "0x765de816845861e75a25fca122bb6898b8b1282a": "cUSD",
    "0xceba9300f2b948710d2653dd7b07f33a8b32118c": "USDC",
    "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73": "cEUR",
    "0xe8537a3d056da446677b9e9d6c5db704eaab4787": "cBRL",
  };
  return map[addr.toLowerCase()] || "USDC";
}

function getServiceIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("trad") || n.includes("swap") || n.includes("defi")) return "📊";
  if (n.includes("research") || n.includes("web") || n.includes("search")) return "🔍";
  if (n.includes("translat") || n.includes("language")) return "🌐";
  if (n.includes("secur") || n.includes("audit")) return "🛡️";
  if (n.includes("content") || n.includes("writ")) return "📝";
  if (n.includes("social") || n.includes("farcast")) return "💬";
  if (n.includes("remit") || n.includes("pay") || n.includes("transfer")) return "💸";
  if (n.includes("hedge") || n.includes("fx") || n.includes("currency")) return "💱";
  return "⚡";
}

// ── Categories ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "defi", label: "DeFi" },
  { key: "research", label: "Research" },
  { key: "content", label: "Content" },
  { key: "social", label: "Social" },
  { key: "security", label: "Security" },
  { key: "payments", label: "Payments" },
];

function matchCategory(name: string, desc: string, cat: string): boolean {
  if (cat === "all") return true;
  const text = `${name} ${desc}`.toLowerCase();
  const keywords: Record<string, string[]> = {
    defi: ["trad", "swap", "defi", "token", "liquidity", "yield"],
    research: ["research", "analys", "data", "report", "web"],
    content: ["content", "writ", "blog", "article", "generat"],
    social: ["social", "farcast", "twitter", "post", "community"],
    security: ["secur", "audit", "smart contract", "vulnerab"],
    payments: ["remit", "pay", "transfer", "fx", "hedge", "currency"],
  };
  return (keywords[cat] || []).some((kw) => text.includes(kw));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OfferingsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [storedAgents, setStoredAgents] = useState<Map<string, StoredAgent>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tab, setTab] = useState<"offerings" | "agents">("agents");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/services`);
        const data = await res.json();
        setServices(data.services || data || []);
      } catch {}

      // Load stored agent metadata from Supabase
      try {
        const { data: agents } = await supabase
          .from("registered_agents")
          .select("agent_nft_id, name, avatar, description, owner_address, tags, price_per_call");
        if (agents) {
          const map = new Map<string, StoredAgent>();
          for (const a of agents) {
            if (a.agent_nft_id != null) {
              map.set(String(a.agent_nft_id), a);
            }
          }
          setStoredAgents(map);
        }
      } catch {}

      // Also load from hosted_agents
      try {
        const { data: hosted } = await supabase
          .from("hosted_agents")
          .select("agent_nft_id, name, description, owner_address");
        if (hosted) {
          setStoredAgents((prev) => {
            const map = new Map(prev);
            for (const h of hosted) {
              if (h.agent_nft_id != null && !map.has(String(h.agent_nft_id))) {
                map.set(String(h.agent_nft_id), { ...h, avatar: null, tags: null, price_per_call: null });
              }
            }
            return map;
          });
        }
      } catch {}

      setLoading(false);
    }
    load();
  }, []);

  useVisibleInterval(() => {
    // Refresh services + agent metadata
    (async () => {
      try {
        const res = await fetch(`${API_URL}/services`);
        const data = await res.json();
        setServices(data.services || data || []);
      } catch {}
    })();
  }, 30_000);

  // ── Derive agents from services + Supabase metadata ──────────────────────

  const agentMap = new Map<string, AgentItem>();

  // First, add all Supabase agents (so marketplace never looks empty)
  for (const [id, stored] of storedAgents.entries()) {
    if (!agentMap.has(id)) {
      const tags = stored.tags || [];
      const tagServices = tags.map((t) => ({
        name: t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " "),
        price: stored.price_per_call ? (() => { try { return formatPrice(BigInt(Math.round(parseFloat(stored.price_per_call) * 1e18)).toString()); } catch { return "1.00"; } })() : "1.00",
        description: "",
      }));
      agentMap.set(id, {
        agentId: id,
        provider: stored.owner_address || "",
        name: stored.name || `Agent #${id}`,
        description: stored.description || "",
        avatar: stored.avatar || "",
        serviceCount: tagServices.length || 1,
        services: tagServices.length > 0 ? tagServices : [{ name: "General", price: "1.00", description: "" }],
        completionRate: 0,
        jobsCompleted: 0,
        revenue: "0",
      });
    }
  }

  // Then enrich with on-chain service data from API
  for (const svc of services) {
    const id = svc.agentId;
    const stored = storedAgents.get(id);

    if (!agentMap.has(id)) {
      agentMap.set(id, {
        agentId: id,
        provider: stored?.owner_address || svc.provider,
        name: stored?.name || svc.name,
        description: stored?.description || svc.description,
        avatar: stored?.avatar || "",
        serviceCount: 0,
        services: [],
        completionRate: 0,
        jobsCompleted: 0,
        revenue: "0",
      });
    }
    const a = agentMap.get(id)!;
    // Update name/desc from Supabase if available
    if (stored?.name && stored.name !== "tes") { a.name = stored.name; }
    if (stored?.description) { a.description = stored.description; }
    if (stored?.avatar) { a.avatar = stored.avatar; }
    a.serviceCount++;
    a.services.push({
      name: svc.name,
      price: formatPrice(svc.pricePerCall),
      description: svc.description,
    });
  }
  const agents = Array.from(agentMap.values());

  // ── Filter ───────────────────────────────────────────────────────────────

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
    return a.name.toLowerCase().includes(q) || a.services.some((s) => s.name.toLowerCase().includes(q));
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <PageTitle title="Browse Agents" />
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Browse</h1>
          <p className="text-[#A1A1A1]/60 text-sm">
            {agents.length} agent{agents.length !== 1 && "s"}{services.length > 0 && ` · ${services.length} service${services.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-6 border-b border-white/[0.06]">
          {(["offerings", "agents"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium transition border-b-2 -mb-px capitalize ${
                tab === t ? "text-[#F4C430] border-[#F4C430]" : "text-[#A1A1A1]/50 border-transparent hover:text-[#F5F5F5]"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Search + Category */}
        <div className="mb-6 space-y-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "offerings" ? "Search services..." : "Search agents..."}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm transition" />

          {tab === "offerings" && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <button key={cat.key} onClick={() => setCategory(cat.key)}
                  className={`px-3 py-2 rounded-lg text-xs whitespace-nowrap transition ${
                    category === cat.key
                      ? "bg-[#F4C430] text-[#0A0A0A] font-bold"
                      : "bg-white/[0.04] text-[#A1A1A1] hover:bg-white/[0.08]"
                  }`}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] flex flex-col min-h-[180px] animate-pulse">
                    <div className="h-4 w-3/4 bg-white/[0.06] rounded mb-3" />
                    <div className="space-y-2 flex-1 mb-4">
                      <div className="h-3 w-full bg-white/[0.04] rounded" />
                      <div className="h-3 w-5/6 bg-white/[0.04] rounded" />
                      <div className="h-3 w-2/3 bg-white/[0.04] rounded" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-white/[0.06]" />
                        <div className="h-3 w-16 bg-white/[0.04] rounded" />
                      </div>
                      <div className="h-3 w-12 bg-[#F4C430]/10 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[#A1A1A1]/40 mb-2">{search ? "No services match your search" : "No on-chain services indexed yet"}</p>
                {search ? (
                  <button onClick={() => setSearch("")} className="text-[#F4C430] text-sm hover:underline">Clear search</button>
                ) : agents.length > 0 ? (
                  <button onClick={() => setTab("agents")} className="text-[#F4C430] text-sm hover:underline">Browse {agents.length} registered agents instead →</button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((svc, idx) => {
                  const stored = storedAgents.get(svc.agentId);
                  const agentName = stored?.name || svc.name;
                  const avatar = stored?.avatar || "";
                  const token = getTokenSymbol(svc.paymentToken);

                  return (
                    <Link key={idx} href={`/agents/${svc.agentId}`}
                      className="p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-[#F4C430]/40 transition group flex flex-col min-h-[180px]">
                      {/* Service name */}
                      <h3 className="font-bold text-[#F5F5F5] text-sm mb-2 group-hover:text-[#F4C430] transition truncate">{svc.name}</h3>

                      {/* Description */}
                      <p className="text-[#A1A1A1]/50 text-xs leading-relaxed flex-1 line-clamp-3 mb-4">{svc.description}</p>

                      {/* Bottom: avatar + agent name + price */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#F4C430]/20 to-[#FF9F1C]/10 flex items-center justify-center overflow-hidden shrink-0">
                            {avatar && avatar.startsWith("http") ? (
                              <img src={avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[9px] font-bold text-[#F4C430]">{agentName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <span className="text-[#A1A1A1]/60 text-xs truncate">by {agentName}</span>
                        </div>
                        <span className="text-[#F4C430] font-semibold text-xs shrink-0 ml-2">{formatPrice(svc.pricePerCall)} {token}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Agents Tab ─────────────────────────────────────────── */}
        {tab === "agents" && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-white/[0.06]" />
                      <div className="flex-1">
                        <div className="h-4 w-1/3 bg-white/[0.06] rounded mb-2" />
                        <div className="h-3 w-1/2 bg-white/[0.04] rounded" />
                      </div>
                    </div>
                    <div className="h-3 w-full bg-white/[0.04] rounded mb-2" />
                    <div className="h-3 w-4/5 bg-white/[0.04] rounded mb-4" />
                    <div className="space-y-2 mb-4">
                      {[1, 2].map((j) => (
                        <div key={j} className="h-8 rounded-lg bg-white/[0.03]" />
                      ))}
                    </div>
                    <div className="border-t border-white/[0.04] pt-3 flex justify-between">
                      <div className="h-3 w-20 bg-[#F4C430]/10 rounded" />
                      <div className="h-3 w-16 bg-white/[0.04] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[#A1A1A1]/40">No agents found</p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.08] overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-white/[0.06] text-[#A1A1A1]/50 text-xs font-medium">
                  <div className="col-span-8 sm:col-span-4">Agent</div>
                  <div className="col-span-2 text-center hidden sm:block">Offerings</div>
                  <div className="col-span-2 text-center hidden sm:block">Success Rate</div>
                  <div className="col-span-2 text-center hidden sm:block">Jobs</div>
                  <div className="col-span-4 sm:col-span-2 text-right">Price</div>
                </div>

                {/* Agent Rows */}
                {filteredAgents.map((agent) => {
                  const icon = agent.avatar || "";
                  const minPrice = agent.services.length > 0
                    ? Math.min(...agent.services.map((s) => parseFloat(s.price)))
                    : 0;

                  return (
                    <Link
                      key={agent.agentId}
                      href={`/agents/${agent.agentId}`}
                      className="grid grid-cols-12 gap-2 px-5 py-4 border-b border-white/[0.04] hover:bg-white/[0.02] transition items-center group"
                    >
                      {/* Agent info */}
                      <div className="col-span-8 sm:col-span-4 flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F4C430]/20 to-[#FF9F1C]/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {icon.startsWith("http") ? (
                            <img src={icon} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-[#F4C430]">{agent.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[#F5F5F5] text-sm font-semibold group-hover:text-[#F4C430] transition block truncate">{agent.name}</span>
                          <p className="text-[#A1A1A1]/30 text-[10px] font-mono truncate">{agent.provider.slice(0, 6)}...{agent.provider.slice(-4)}</p>
                        </div>
                      </div>

                      {/* Offerings count */}
                      <div className="col-span-2 text-center hidden sm:block">
                        <span className="text-[#F5F5F5] text-sm">{agent.serviceCount}</span>
                      </div>

                      {/* Success Rate */}
                      <div className="col-span-2 text-center hidden sm:block">
                        <span className={`text-sm font-medium ${agent.completionRate >= 80 ? "text-green-400" : agent.completionRate >= 50 ? "text-[#F4C430]" : "text-[#A1A1A1]/50"}`}>
                          {agent.completionRate > 0 ? `${agent.completionRate.toFixed(1)}%` : "—"}
                        </span>
                      </div>

                      {/* Jobs */}
                      <div className="col-span-2 text-center hidden sm:block">
                        <span className="text-[#F5F5F5] text-sm">{agent.jobsCompleted.toLocaleString()}</span>
                      </div>

                      {/* Price */}
                      <div className="col-span-4 sm:col-span-2 text-right">
                        <span className="text-[#F4C430] text-sm font-semibold">{minPrice > 0 ? `${minPrice.toFixed(2)}` : "—"}</span>
                        <span className="text-[#A1A1A1]/30 text-xs ml-1">USDC</span>
                      </div>
                    </Link>
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
