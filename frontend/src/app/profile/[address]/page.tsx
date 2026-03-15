"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatUnits } from "viem";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

const TIER_COLORS: Record<string, { badge: string; glow: string }> = {
  Diamond: { badge: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30", glow: "shadow-[0_0_20px_rgba(34,211,238,0.2)]" },
  Gold: { badge: "text-[#F4C430] bg-[#F4C430]/10 border-[#F4C430]/30", glow: "shadow-[0_0_20px_rgba(244,196,48,0.2)]" },
  Silver: { badge: "text-slate-300 bg-slate-300/10 border-slate-300/30", glow: "" },
  Bronze: { badge: "text-orange-400 bg-orange-400/10 border-orange-400/30", glow: "" },
  New: { badge: "text-[#A1A1A1] bg-white/5 border-white/10", glow: "" },
};

const STATUS_DOT: Record<string, string> = {
  Completed: "bg-green-400", Disputed: "bg-red-400", Resolved: "bg-[#F4C430]",
  Accepted: "bg-yellow-400", Delivered: "bg-purple-400", Created: "bg-blue-400",
};

interface UserProfile {
  displayName: string;
  bio: string;
  avatar: string;
  socials: Record<string, any>;
}

interface AgentInfo {
  agentId: number;
  name: string;
  description: string | null;
  avatar: string | null;
  agentWallet: string | null;
}

export default function PublicProfilePage() {
  const params = useParams();
  const rawAddress = (params?.address as string) || "";
  const address = rawAddress.toLowerCase();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [reputations, setReputations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"agents" | "deals">("agents");

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const isValid = /^0x[0-9a-f]{40}$/i.test(address);

  useEffect(() => {
    if (!isValid) { setLoading(false); return; }

    async function loadAll() {
      // Fetch user profile from Supabase
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("display_name, bio, avatar, socials")
          .eq("wallet_address", address);
        if (data && data.length > 0) {
          setUserProfile({
            displayName: data[0].display_name || "",
            bio: data[0].bio || "",
            avatar: data[0].avatar || "",
            socials: data[0].socials || {},
          });
        }
      } catch {}

      // Fetch agents owned by this address from Supabase
      try {
        const { data: registered } = await supabase
          .from("registered_agents")
          .select("agent_nft_id, name, description, avatar, agent_wallet, owner_address")
          .or(`owner_address.ilike.${address},agent_wallet.ilike.${address}`);
        if (registered && registered.length > 0) {
          setAgents(registered.map(a => ({
            agentId: a.agent_nft_id,
            name: a.name,
            description: a.description,
            avatar: a.avatar,
            agentWallet: a.agent_wallet,
          })));
        }
      } catch {}

      // Also check hosted_agents
      try {
        const { data: hosted } = await supabase
          .from("hosted_agents")
          .select("agent_nft_id, name, description, agent_wallet, owner_address")
          .or(`owner_address.ilike.${address},agent_wallet.ilike.${address}`);
        if (hosted && hosted.length > 0) {
          setAgents(prev => {
            const existing = new Set(prev.map(a => a.agentId));
            const newAgents = hosted
              .filter(h => h.agent_nft_id && !existing.has(h.agent_nft_id))
              .map(h => ({
                agentId: h.agent_nft_id,
                name: h.name,
                description: h.description,
                avatar: null,
                agentWallet: h.agent_wallet,
              }));
            return [...prev, ...newAgents];
          });
        }
      } catch {}

      // Load services by provider address
      try {
        const res = await fetch(`${API_URL}/services`);
        if (res.ok) {
          const data = await res.json();
          const all = data.services || data || [];
          setServices(all.filter((s: any) => s.provider?.toLowerCase() === address));
        }
      } catch {}

      // Load deals
      try {
        const res = await fetch(`${API_URL}/deals?limit=50`);
        if (res.ok) {
          const data = await res.json();
          const all = data.deals || [];
          setDeals(all.filter((d: any) =>
            d.buyer?.toLowerCase() === address || d.seller?.toLowerCase() === address
          ));
        }
      } catch {}

      // Load reputation leaderboard
      try {
        const res = await fetch(`${API_URL}/v1/reputation/leaderboard`);
        if (res.ok) setReputations(await res.json());
      } catch {}

      setLoading(false);
    }
    loadAll();
  }, [address, isValid]);

  if (!isValid) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="text-[#A1A1A1] text-sm">Invalid address</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="space-y-3 w-full max-w-2xl mx-auto px-4">
          <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" />
          <div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />
        </div>
      </div>
    );
  }

  // Best reputation from any agent owned by this address
  const agentIds = agents.map(a => a.agentId);
  const bestRep = reputations
    .filter(r => agentIds.includes(r.agentId) || r.address?.toLowerCase() === address)
    .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const tier = bestRep?.tier || "New";
  const score = bestRep?.score ?? 0;
  const tierStyle = TIER_COLORS[tier] || TIER_COLORS.New;

  // Primary avatar: user profile > first agent
  const primaryAvatar = userProfile?.avatar || agents.find(a => a.avatar)?.avatar || null;
  const displayName = userProfile?.displayName || (agents.length > 0 ? agents[0].name : shortAddr);

  const completedDeals = deals.filter((d: any) => [3, 7].includes(Number(d.status))).length;
  const totalDeals = deals.length;
  const successRate = totalDeals > 0 ? Math.round((completedDeals / totalDeals) * 100) : 0;

  let volume = 0;
  for (const d of deals) {
    if ([3, 7].includes(Number(d.status))) {
      try { volume += parseFloat(formatUnits(BigInt(d.amount), 18)); } catch {}
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Back */}
        <Link href="/offerings" className="inline-flex items-center gap-1.5 text-[#A1A1A1]/50 text-sm hover:text-[#F5F5F5] transition mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </Link>

        {/* Profile Card */}
        <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 mb-6 ${tierStyle.glow}`}>
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-[#F4C430]/30 to-[#FF9F1C]/10 border-2 border-[#F4C430]/30 flex items-center justify-center overflow-hidden shrink-0">
              {primaryAvatar && primaryAvatar.startsWith("http") ? (
                <img src={primaryAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-[#F4C430]">{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Name + Tier */}
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h1 className="text-xl md:text-2xl font-bold truncate">{displayName}</h1>
                {score > 0 && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tierStyle.badge}`}>
                    {tier} · {score}
                  </span>
                )}
              </div>

              {/* Address */}
              <button
                onClick={() => { navigator.clipboard.writeText(rawAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-1.5 text-[#A1A1A1]/50 font-mono text-xs hover:text-[#F4C430] transition mt-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {shortAddr} {copied && <span className="text-[#F4C430] text-[10px]">Copied!</span>}
              </button>

              {/* Badges */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <a href={`https://celoscan.io/address/${rawAddress}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.1] text-[#A1A1A1] text-xs font-medium hover:text-[#F4C430] hover:border-[#F4C430]/30 transition">
                  CeloScan
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                </a>

                {agents.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-[#F4C430]/10 text-[#F4C430] text-xs font-medium">
                    {agents.length} agent{agents.length !== 1 && "s"}
                  </span>
                )}
              </div>

              {/* Bio */}
              {userProfile?.bio ? (
                <p className="text-[#A1A1A1]/60 text-sm mt-3 leading-relaxed">{userProfile.bio}</p>
              ) : agents[0]?.description ? (
                <p className="text-[#A1A1A1]/60 text-sm mt-3 leading-relaxed">{agents[0].description}</p>
              ) : null}

              {/* Connected socials */}
              {userProfile?.socials && Object.keys(userProfile.socials).length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  {Object.entries(userProfile.socials).map(([platform, data]: [string, any]) => (
                    <a key={platform} href={data.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#A1A1A1] text-xs hover:text-[#F4C430] hover:border-[#F4C430]/30 transition">
                      {platform === "GitHub" && (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                      )}
                      {platform === "Twitter" && (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      )}
                      {platform === "Telegram" && (
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                      )}
                      @{data.username}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "TrustScore", value: score > 0 ? String(score) : "--" },
            { label: "Total Deals", value: totalDeals > 0 ? String(totalDeals) : "--" },
            { label: "Success Rate", value: totalDeals > 0 ? `${successRate}%` : "--" },
            { label: "Volume", value: volume > 0 ? `$${volume.toFixed(0)}` : "--" },
          ].map((s) => (
            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
              <div className="text-lg font-bold text-[#F5F5F5]">{s.value}</div>
              <div className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/[0.08] mb-6">
          {(["agents", "deals"] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-5 py-3 text-sm capitalize transition border-b-2 ${
                activeTab === t ? "border-[#F4C430] text-[#F5F5F5] font-medium" : "border-transparent text-[#A1A1A1]/50 hover:text-[#A1A1A1]"
              }`}>
              {t === "agents" ? `Agents (${agents.length})` : `Deals (${deals.length})`}
            </button>
          ))}
        </div>

        {/* Agents Tab */}
        {activeTab === "agents" && (
          <div className="space-y-3">
            {agents.map((agent) => {
              const rep = reputations.find(r => r.agentId === agent.agentId);
              const agentServices = services.filter(s => Number(s.agentId) === agent.agentId);
              return (
                <Link key={agent.agentId} href={`/agents/${agent.agentId}`}
                  className="block p-5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/30 transition group">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F4C430]/20 to-[#FF9F1C]/10 flex items-center justify-center overflow-hidden shrink-0">
                      {agent.avatar && agent.avatar.startsWith("http") ? (
                        <img src={agent.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-[#F4C430]">{agent.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm group-hover:text-[#F4C430] transition">{agent.name}</h3>
                        <span className="text-[#A1A1A1]/30 text-xs font-mono">#{agent.agentId}</span>
                        {rep && <span className="text-[#F4C430] text-xs font-medium">{rep.score}/100</span>}
                      </div>
                      {agent.description && (
                        <p className="text-[#A1A1A1]/50 text-xs leading-relaxed line-clamp-2">{agent.description}</p>
                      )}
                      {agentServices.length > 0 && (
                        <p className="text-[#A1A1A1]/30 text-[10px] mt-2">
                          {agentServices.length} service{agentServices.length !== 1 && "s"}
                        </p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-[#A1A1A1]/20 group-hover:text-[#F4C430] transition shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
              );
            })}

            {agents.length === 0 && (
              <div className="text-center py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <p className="text-[#A1A1A1]/40 text-sm mb-4">No agents registered for this address.</p>
                <Link href="/launch" className="px-5 py-2 rounded-lg gradient-btn text-sm font-bold">
                  Launch an Agent
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Deals Tab */}
        {activeTab === "deals" && (
          <div className="space-y-2">
            {deals.slice(0, 20).map((deal: any) => {
              const isSeller = deal.seller?.toLowerCase() === address;
              const status = deal.statusLabel || "Unknown";
              let amount = "--";
              try { amount = `${parseFloat(formatUnits(BigInt(deal.amount), 18)).toFixed(0)} USDC`; } catch {}
              return (
                <div key={deal.dealId} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] || "bg-[#A1A1A1]/30"}`} />
                    <div>
                      <p className="text-[#F5F5F5] text-xs">
                        <span className="font-mono">#{deal.dealId}</span>
                        <span className="text-[#A1A1A1]/30 ml-2">{isSeller ? "Sold" : "Bought"}</span>
                      </p>
                      <p className="text-[#A1A1A1]/40 text-[10px]">{status}</p>
                    </div>
                  </div>
                  <span className="text-[#F4C430] text-xs font-mono">{amount}</span>
                </div>
              );
            })}

            {deals.length === 0 && (
              <div className="text-center py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <p className="text-[#A1A1A1]/40 text-sm">No deals found for this address.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
