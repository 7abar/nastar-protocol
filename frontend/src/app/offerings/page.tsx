"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

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
}

interface AgentItem {
  agentId: string;
  provider: string;
  name: string;
  description: string;
  avatar: string;
  serviceCount: number;
  services: { name: string; price: string; description: string }[];
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
  const [tab, setTab] = useState<"offerings" | "agents">("offerings");

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
          .select("agent_nft_id, name, avatar, description, owner_address");
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
                map.set(String(h.agent_nft_id), { ...h, avatar: null });
              }
            }
            return map;
          });
        }
      } catch {}

      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  // ── Derive agents from services + Supabase metadata ──────────────────────

  const agentMap = new Map<string, AgentItem>();
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
      });
    }
    const a = agentMap.get(id)!;
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
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Browse</h1>
          <p className="text-[#A1A1A1]/60 text-sm">
            {services.length} service{services.length !== 1 && "s"} from {agents.length} agent{agents.length !== 1 && "s"}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-44 rounded-xl bg-white/[0.03] animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[#A1A1A1]/40 mb-2">{search ? "No services match your search" : "No services in this category"}</p>
                {search && <button onClick={() => setSearch("")} className="text-[#F4C430] text-sm hover:underline">Clear search</button>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((svc, idx) => {
                  const stored = storedAgents.get(svc.agentId);
                  const agentName = stored?.name || svc.name;
                  const token = getTokenSymbol(svc.paymentToken);

                  return (
                    <div key={idx} className="p-5 rounded-xl glass-card hover:border-[#F4C430]/50 transition group flex flex-col">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F4C430]/20 to-[#FF9F1C]/10 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                          {stored?.avatar && stored.avatar.startsWith("http") ? (
                            <img src={stored.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            getServiceIcon(svc.name)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-[#F5F5F5] text-sm group-hover:text-[#F4C430] transition">{svc.name}</h3>
                          <Link href={`/agents/${svc.agentId}`} className="text-[#A1A1A1]/40 text-[10px] hover:text-[#F4C430] transition">
                            by {agentName}
                          </Link>
                        </div>
                      </div>
                      <p className="text-[#A1A1A1]/60 text-xs leading-relaxed flex-1 mb-4 line-clamp-3">{svc.description}</p>
                      <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                        <span className="text-[#F4C430] font-semibold text-sm">{formatPrice(svc.pricePerCall)} {token}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${svc.active ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"}`}>
                          {svc.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
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
                {[1, 2].map((i) => <div key={i} className="h-48 rounded-xl bg-white/[0.03] animate-pulse" />)}
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-[#A1A1A1]/40">No agents found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredAgents.map((agent) => {
                  const gradient = getGradient(agent.agentId);
                  const icon = agent.avatar || "🤖";
                  const minPrice = agent.services.length > 0
                    ? Math.min(...agent.services.map((s) => parseFloat(s.price)))
                    : 0;

                  return (
                    <Link key={agent.agentId} href={`/agents/${agent.agentId}`}
                      className="p-5 rounded-xl glass-card hover:border-[#F4C430]/50 transition group block">
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-lg overflow-hidden`}>
                          {icon.startsWith("http") ? (
                            <img src={icon} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">{icon || "🤖"}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-[#F5F5F5] text-sm group-hover:text-[#F4C430] transition">{agent.name}</h3>
                            <span className="px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 text-[10px] font-medium">Active</span>
                          </div>
                          <p className="text-[#A1A1A1]/40 text-[11px] font-mono truncate">
                            {agent.provider.slice(0, 6)}...{agent.provider.slice(-4)}
                          </p>
                        </div>
                      </div>

                      {/* Agent description */}
                      {agent.description && (
                        <p className="text-[#A1A1A1]/50 text-xs leading-relaxed mb-4 line-clamp-2">{agent.description}</p>
                      )}

                      {/* Services list */}
                      <div className="mb-4">
                        <p className="text-[#A1A1A1]/30 text-[10px] uppercase tracking-wider mb-2">
                          {agent.serviceCount} service{agent.serviceCount !== 1 && "s"}
                        </p>
                        <div className="space-y-1.5">
                          {agent.services.slice(0, 3).map((svc, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/[0.02]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm">{getServiceIcon(svc.name)}</span>
                                <span className="text-[#A1A1A1]/70 text-xs truncate">{svc.name}</span>
                              </div>
                              <span className="text-[#F4C430] text-xs font-medium shrink-0 ml-2">{svc.price}</span>
                            </div>
                          ))}
                          {agent.services.length > 3 && (
                            <p className="text-[#A1A1A1]/30 text-[10px] text-center">+{agent.services.length - 3} more</p>
                          )}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                        <span className="text-[#A1A1A1]/40 text-xs">
                          from <span className="text-[#F4C430] font-semibold">{minPrice.toFixed(2)}</span> per task
                        </span>
                        <span className="text-[#A1A1A1]/30 text-[10px] group-hover:text-[#F4C430] transition">
                          View profile →
                        </span>
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
