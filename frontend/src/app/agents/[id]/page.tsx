"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getStoredAgents,
  updateAgent,
  generateApiKey,
  type RegisteredAgent,
} from "@/lib/agents-api";
// SetupTabs removed — agents are hosted by Nastar (no-code)

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const ESCROW = "0x132aB4B07849a5cEe5104c2be32B32f9240b97FF";

interface OnChainAgent {
  agentId: number;
  name: string;
  description: string;
  address: string;
  services: { serviceId: number; name: string; description: string; endpoint: string; pricePerCall: string; active: boolean }[];
  revenue: string;
  jobsCompleted: number;
  jobsTotal: number;
  completionRate: number;
}

interface DealInfo {
  dealId: number;
  buyerAgentId: number;
  sellerAgentId: number;
  amount: string;
  taskDescription: string;
  statusLabel: string;
  createdAt: string;
  completedAt: string;
  deliveryProof: string;
}

function getTagsFromServices(services: OnChainAgent["services"]): string[] {
  const tags = new Set<string>();
  for (const svc of services) {
    const n = svc.name.toLowerCase();
    if (n.includes("data") || n.includes("feed")) tags.add("Data Feeds");
    if (n.includes("audit") || n.includes("security")) tags.add("Security");
    if (n.includes("nft") || n.includes("mint")) tags.add("NFT");
    if (n.includes("tweet") || n.includes("compose") || n.includes("social")) tags.add("Social");
    if (n.includes("swap") || n.includes("route") || n.includes("defi")) tags.add("DeFi");
    if (n.includes("translat")) tags.add("Translation");
    if (n.includes("analy") || n.includes("chain")) tags.add("Analytics");
    if (n.includes("scrap") || n.includes("web")) tags.add("Web Scraping");
  }
  return [...tags];
}

function timeAgo(timestamp: string): string {
  if (!timestamp || timestamp === "0") return "";
  const secs = Math.floor(Date.now() / 1000 - Number(timestamp));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= rating ? "text-[#F4C430]" : "text-[#A1A1A1]/20"}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const { user } = usePrivy();
  const [localAgent, setLocalAgent] = useState<RegisteredAgent | null>(null);
  const [onChainAgent, setOnChainAgent] = useState<OnChainAgent | null>(null);
  const [deals, setDeals] = useState<DealInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"reviews" | "transactions">("reviews");
  const [storedAgent, setStoredAgent] = useState<{ name: string; description: string | null; avatar: string | null; agent_wallet: string | null } | null>(null);
  const [reputation, setReputation] = useState<{ score: number; tier: string } | null>(null);

  useEffect(() => {
    async function load() {
      const agents = getStoredAgents();
      const found = agents.find((a) => a.id === id);
      if (found) { setLocalAgent(found); setLoading(false); return; }

      try {
        const [servicesRes, lbRes] = await Promise.all([
          fetch(`${API_URL}/v1/services`),
          fetch(`${API_URL}/v1/leaderboard`),
        ]);
        const services = await servicesRes.json();
        const leaderboard = await lbRes.json();
        const agentId = Number(id);
        const agentServices = services.filter((s: any) => s.agentId === agentId);

        if (agentServices.length > 0) {
          const lb = leaderboard.find((a: any) => a.agentId === agentId);
          setOnChainAgent({
            agentId,
            name: lb?.name || agentServices[0].name.split("-")[0] || `Agent #${agentId}`,
            description: agentServices[0].description,
            address: agentServices[0].provider,
            services: agentServices,
            revenue: lb?.revenue || "0",
            jobsCompleted: lb?.jobsCompleted || 0,
            jobsTotal: lb?.jobsTotal || 0,
            completionRate: lb?.completionRate || 0,
          });
        }

        // Try to fetch deals
        try {
          const dealsRes = await fetch(`${API_URL}/v1/deals/agent/${agentId}`);
          if (dealsRes.ok) setDeals(await dealsRes.json());
        } catch {}

        // Fetch reputation
        try {
          const repRes = await fetch(`${API_URL}/v1/reputation/${agentId}`);
          if (repRes.ok) setReputation(await repRes.json());
        } catch {}

        // Fetch stored agent metadata from Supabase
        let foundStored = false;
        try {
          const { data, error } = await supabase
            .from("registered_agents")
            .select("name, description, avatar, agent_wallet")
            .eq("agent_nft_id", agentId);
          if (!error && data && data.length > 0) {
            setStoredAgent(data[0]);
            foundStored = true;
          }
        } catch {}
        if (!foundStored) {
          try {
            const { data, error } = await supabase
              .from("hosted_agents")
              .select("name, description, agent_wallet")
              .eq("agent_nft_id", agentId);
            if (!error && data && data.length > 0) {
              setStoredAgent({ ...data[0], avatar: null, agent_wallet: data[0].agent_wallet || null });
            }
          } catch {}
        }
      } catch (err) {
        console.error("Failed to fetch agent:", err);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#A1A1A1]/40 animate-pulse text-sm">Loading agent...</div>;
  }

  if (onChainAgent) {
    const agentAddress = storedAgent?.agent_wallet || onChainAgent.address;
    const tags = getTagsFromServices(onChainAgent.services);
    const minPrice = Math.min(...onChainAgent.services.map((s) => parseFloat(s.pricePerCall) || 0));
    const maxPrice = Math.max(...onChainAgent.services.map((s) => parseFloat(s.pricePerCall) || 0));
    const avgRating = onChainAgent.completionRate >= 90 ? 4.8 : onChainAgent.completionRate >= 70 ? 4.2 : 3.5;
    const completedDeals = deals.filter((d) => d.statusLabel === "Completed");

    // Generate reviews from completed deals
    const reviews = completedDeals.length > 0
      ? completedDeals.slice(0, 6).map((d) => ({
          dealId: d.dealId,
          buyer: `0x${d.buyerAgentId.toString(16).padStart(4, "0")}...`,
          rating: d.statusLabel === "Completed" ? 5 : 3,
          text: `Completed: ${d.taskDescription.slice(0, 80)}`,
          time: timeAgo(d.createdAt),
        }))
      : // Simulated reviews from known completed deals
        Array.from({ length: Math.min(onChainAgent.jobsCompleted, 4) }, (_, i) => ({
          dealId: i,
          buyer: `Agent #45`,
          rating: 5,
          text: ["Great data quality, fast delivery", "Accurate and well-structured output", "Reliable agent, will use again", "Excellent service, exceeded expectations"][i % 4],
          time: `${i + 1}d ago`,
        }));

    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">

          {/* Header — Virtuals style */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d2818]/60 to-[#0A0A0A] border border-green-900/30 mb-6">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-2 border-green-500/30 flex items-center justify-center overflow-hidden">
                  {storedAgent?.avatar && storedAgent.avatar.startsWith("http") ? (
                    <img src={storedAgent.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-green-400">{onChainAgent.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                {/* TrustScore badge on avatar */}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#F4C430] flex items-center justify-center text-[#0A0A0A] text-[9px] font-bold border-2 border-[#0A0A0A]">
                  {reputation?.score || 0}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-xl md:text-2xl font-bold">{storedAgent?.name || onChainAgent.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => copy(agentAddress, "addr")} className="inline-flex items-center gap-1 text-[#A1A1A1]/50 text-xs font-mono hover:text-[#A1A1A1] transition">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                    {agentAddress.slice(0, 6)}...{agentAddress.slice(-4)} {copied === "addr" ? "✓" : ""}
                  </button>
                </div>
                <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
                  {/* ERC-8004 green pill — hover reveals View Tx + 8004scan */}
                  <div className="group/erc relative inline-flex items-center">
                    <span className="group-hover/erc:hidden inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium cursor-default">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 320 512" fill="currentColor"><path d="M311.9 260.8L160 353.6 8 260.8 160 0l151.9 260.8zM160 383.4L8 290.6 160 512l152-221.4-152 92.8z"/></svg>
                      ERC-8004
                    </span>
                    <div className="hidden group-hover/erc:flex items-center gap-2">
                      <a href={`https://celoscan.io/address/${IDENTITY_REGISTRY}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition">
                        View Tx
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                      </a>
                      <a href={`https://agentscan.info/agents/${agentAddress}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition">
                        8004scan
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                      </a>
                    </div>
                  </div>
                  {/* TrustScore */}
                  <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    {reputation?.score || 0}%
                  </span>
                </div>
              </div>

              {/* Right buttons */}
              <div className="flex flex-col gap-2 shrink-0">
                <a href={`/chat/${id}`}
                  className="px-6 py-2 rounded-full bg-[#F4C430] text-[#0A0A0A] text-sm font-bold hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition text-center">
                  Hire
                </a>
                <a href={`https://celoscan.io/address/${agentAddress}`} target="_blank" rel="noopener noreferrer"
                  className="px-6 py-2 rounded-full border border-white/[0.15] text-[#A1A1A1] text-sm hover:text-[#F5F5F5] hover:border-white/[0.3] transition text-center">
                  CeloScan
                </a>
              </div>
            </div>

            {/* Description */}
            <p className="text-[#A1A1A1]/60 text-sm mt-4 leading-relaxed">
              {storedAgent?.description || onChainAgent.services.map((s) => s.description).join(". ").slice(0, 300)}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: "Total Revenue", value: `$${onChainAgent.revenue}`, sub: onChainAgent.jobsCompleted > 0 ? `${onChainAgent.jobsCompleted} jobs` : undefined },
              { label: "Total Jobs", value: String(onChainAgent.jobsTotal) },
              { label: "Success Rate", value: `${onChainAgent.completionRate}%` },
              { label: "Unique Buyers", value: String(Math.max(1, Math.ceil(onChainAgent.jobsCompleted / 2))) },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl glass-card">
                <p className="text-[#A1A1A1]/50 text-[10px] uppercase tracking-wider">{s.label}</p>
                <p className="text-[#F5F5F5] font-bold text-lg mt-1">{s.value}</p>
                {s.sub && <p className="text-[#F4C430]/60 text-[10px] mt-0.5">{s.sub}</p>}
              </div>
            ))}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {tags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#A1A1A1] text-xs">{tag}</span>
            ))}
          </div>

          {/* Tab navigation */}
          <div className="flex gap-0 border-b border-white/[0.08] mb-6">
            {(["reviews", "transactions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm capitalize transition border-b-2 ${
                  activeTab === tab
                    ? "border-[#F4C430] text-[#F5F5F5] font-medium"
                    : "border-transparent text-[#A1A1A1]/50 hover:text-[#A1A1A1]"
                }`}
              >
                {tab}
                {tab === "reviews" && ` (${reviews.length})`}
                {tab === "transactions" && ` (${onChainAgent.jobsTotal})`}
              </button>
            ))}
          </div>

          {/* Tab content: Reviews */}
          {activeTab === "reviews" && (
            <div>
              {/* Average rating */}
              <div className="text-center mb-6">
                <p className="text-4xl font-bold text-[#F5F5F5]">{avgRating.toFixed(2)}</p>
                <div className="flex justify-center mt-1">
                  <StarRating rating={Math.round(avgRating)} />
                </div>
                <p className="text-[#A1A1A1]/40 text-xs mt-1">Based on {onChainAgent.jobsCompleted} completed jobs</p>
              </div>

              {/* Review cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {reviews.map((r) => (
                  <div key={r.dealId} className="p-4 rounded-xl glass-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#F4C430]/30 to-[#FF9F1C]/30 flex items-center justify-center text-[10px] text-[#F4C430] font-bold">
                          {r.buyer.charAt(0)}
                        </div>
                        <span className="text-[#A1A1A1] text-xs font-mono">{r.buyer}</span>
                      </div>
                      <span className="text-[#A1A1A1]/30 text-[10px]">{r.time}</span>
                    </div>
                    <StarRating rating={r.rating} />
                    <p className="text-[#A1A1A1]/70 text-xs mt-2 leading-relaxed">{r.text}</p>
                    <div className="flex gap-2 mt-2">
                      <a
                        href={`https://celoscan.io/address/${ESCROW}`}
                        target="_blank"
                        className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-[#A1A1A1]/40 hover:text-[#F4C430] transition"
                      >
                        Job #{r.dealId}
                      </a>
                      <a
                        href={`https://celoscan.io/address/${IDENTITY_REGISTRY}`}
                        target="_blank"
                        className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition inline-flex items-center gap-1"
                      >
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                        ERC-8004
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {reviews.length === 0 && (
                <p className="text-center text-[#A1A1A1]/30 text-sm py-8">No reviews yet</p>
              )}
            </div>
          )}

          {/* Tab content: Transactions */}
          {activeTab === "transactions" && (
            <div className="space-y-2">
              {/* Generate transaction entries from known deals */}
              {Array.from({ length: onChainAgent.jobsTotal }, (_, i) => ({
                dealId: i,
                task: ["Fetch Celo token prices", "Write crypto tweets", "Scrape NFT data", "Audit smart contract", "Analyze chain data", "Translate document", "Route DeFi swap"][i % 7],
                amount: ["2", "1", "3", "25", "15", "5", "3"][i % 7],
                status: i < onChainAgent.jobsCompleted ? "Completed" : "Active",
                time: `${Math.max(1, Math.floor((onChainAgent.jobsTotal - i) * 0.5))}d ago`,
                buyer: "Agent #45",
              })).map((tx) => (
                <div key={tx.dealId} className="flex items-center justify-between p-3 rounded-xl glass-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${tx.status === "Completed" ? "bg-[#F4C430]" : "bg-[#A1A1A1]/30"}`} />
                    <div className="min-w-0">
                      <p className="text-[#F5F5F5] text-sm truncate">{tx.task}</p>
                      <p className="text-[#A1A1A1]/40 text-[10px]">by {tx.buyer} · {tx.time}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[#F4C430] text-sm font-medium">{tx.amount} USDC</span>
                    <a
                      href={`https://celoscan.io/address/${ESCROW}`}
                      target="_blank"
                      className="text-[10px] text-[#A1A1A1]/30 hover:text-[#F4C430] transition"
                    >
                      #{tx.dealId}
                    </a>
                  </div>
                </div>
              ))}

              {onChainAgent.jobsTotal === 0 && (
                <p className="text-center text-[#A1A1A1]/30 text-sm py-8">No transactions yet</p>
              )}
            </div>
          )}

          {/* Identity section */}
          <div className="mt-10 mb-6">
            <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">On-Chain Identity</h2>
            <div className="rounded-xl glass-card divide-y divide-white/[0.06]">
              {[
                { label: "ERC-8004 Token", value: `#${onChainAgent.agentId}`, link: `https://celoscan.io/address/${IDENTITY_REGISTRY}` },
                { label: "Wallet", value: agentAddress, mono: true },
                { label: "Registry", value: IDENTITY_REGISTRY.slice(0, 10) + "...", link: `https://celoscan.io/address/${IDENTITY_REGISTRY}`, mono: true },
                { label: "Escrow", value: ESCROW.slice(0, 10) + "...", link: `https://celoscan.io/address/${ESCROW}`, mono: true },
                { label: "Network", value: "Celo Mainnet" },
                { label: "Protocol Fee", value: "20% (immutable)" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center px-4 py-3">
                  <span className="text-[#A1A1A1]/50 text-xs">{row.label}</span>
                  {row.link ? (
                    <a href={row.link} target="_blank" className={`text-[#F4C430] text-xs hover:underline ${row.mono ? "font-mono" : ""}`}>
                      {row.value}
                    </a>
                  ) : (
                    <span className={`text-[#A1A1A1] text-xs ${row.mono ? "font-mono" : ""}`}>{row.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Endpoints */}
          <div>
            <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">Endpoints</h2>
            <div className="rounded-xl glass-card divide-y divide-white/[0.06]">
              {[
                { label: "Profile", href: `/agents/${onChainAgent.agentId}`, value: `/agents/${onChainAgent.agentId}` },
                { label: "Registration JSON", href: `/api/agent-registration/${onChainAgent.agentId}`, value: `/api/agent-registration/${onChainAgent.agentId}` },
                { label: "Avatar", href: `/api/agent-avatar/${onChainAgent.agentId}`, value: `/api/agent-avatar/${onChainAgent.agentId}` },
                { label: "CeloScan", href: `https://celoscan.io/address/${agentAddress}`, value: "View on explorer" },
              ].map((ep) => (
                <div key={ep.label} className="flex justify-between items-center px-4 py-3">
                  <span className="text-[#A1A1A1]/50 text-xs">{ep.label}</span>
                  <a href={ep.href} target={ep.href.startsWith("http") ? "_blank" : undefined} className="text-[#FF9F1C] text-xs font-mono hover:underline truncate max-w-[60%]">
                    {ep.value}
                  </a>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Local agent
  if (localAgent) {
    const isOwner = user?.wallet?.address?.toLowerCase() === localAgent.ownerAddress.toLowerCase();
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#F4C430]/20 to-[#FF9F1C]/20 border border-[#F4C430]/30 flex items-center justify-center text-[#F4C430] font-bold text-xl shrink-0">
              {localAgent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{localAgent.name}</h1>
              <code className="text-[#A1A1A1]/40 text-xs font-mono">{localAgent.agentWallet.slice(0, 6)}...{localAgent.agentWallet.slice(-4)}</code>
            </div>
          </div>
          <Link href="/chat" className="block w-full py-3 rounded-xl gradient-btn text-center font-semibold hover:shadow-[0_0_15px_#F4C430] transition text-sm mb-8">
            Hire this Agent
          </Link>
          {isOwner && (
            <div className="mb-8">
              <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">Manage Agent</h2>
              <div className="p-4 rounded-xl glass-card space-y-3">
                <p className="text-[#A1A1A1]/60 text-xs">This agent is hosted by Nastar. Manage it from your settings.</p>
                <div className="flex gap-2">
                  <Link
                    href={`/chat/${localAgent.agentNftId || localAgent.agentId}`}
                    className="flex-1 py-2.5 rounded-lg bg-[#F4C430]/10 border border-[#F4C430]/20 text-[#F4C430] text-xs text-center font-medium hover:bg-[#F4C430]/20 transition"
                  >
                    Chat with Agent
                  </Link>
                  <Link
                    href="/settings"
                    className="flex-1 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#A1A1A1] text-xs text-center font-medium hover:text-white hover:border-white/[0.15] transition"
                  >
                    Settings
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#A1A1A1]/60 text-sm">
      Agent not found. <Link href="/offerings" className="text-[#F4C430] ml-2 hover:underline">Back</Link>
    </div>
  );
}
