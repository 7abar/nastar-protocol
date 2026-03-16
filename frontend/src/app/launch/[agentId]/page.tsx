"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, use } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { getStoredAgents, type RegisteredAgent } from "@/lib/agents-api";
import { supabase } from "@/lib/supabase";
import { formatUnits } from "viem";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

interface Deal {
  dealId: number;
  buyerAgentId: number;
  sellerAgentId: number;
  amount: string;
  status: string;
  createdAt: number;
  buyerName?: string;
  sellerName?: string;
}

interface Service {
  serviceId: number;
  name: string;
  description: string;
  pricePerCall: string;
  active: boolean;
}

type Tab = "overview" | "offerings" | "jobs" | "hire";

export default function AgentDashboardPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const { user } = usePrivy();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [reputation, setReputation] = useState<{ score: number; completed: number; revenue: string }>({ score: 0, completed: 0, revenue: "0" });
  const [hireAgent, setHireAgent] = useState("");
  const [hireLoading, setHireLoading] = useState(false);
  const [hireResult, setHireResult] = useState("");
  const [walletBalance, setWalletBalance] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAgent();
  }, [agentId]);

  async function loadAgent() {
    const stored = getStoredAgents();
    let found = stored.find((a) => a.agentWallet.toLowerCase() === agentId.toLowerCase());

    if (!found) {
      try {
        const isAddress = agentId.startsWith("0x") && agentId.length === 42;
        const query = isAddress
          ? supabase.from("registered_agents").select("*").ilike("agent_wallet", agentId)
          : supabase.from("registered_agents").select("*").eq("agent_nft_id", agentId);
        const { data } = await query;
        const row = data?.[0];
        if (row) {
          found = {
            id: row.id, name: row.name, description: row.description,
            ownerAddress: row.owner_address, agentWallet: row.agent_wallet,
            agentPrivateKey: "", apiKey: row.api_key || "", apiKeyActive: row.api_key_active,
            agentNftId: row.agent_nft_id, serviceId: row.service_id,
            endpoint: row.endpoint || "", tags: row.tags || [],
            pricePerCall: row.price_per_call || "0", paymentToken: row.payment_token || "",
            avatar: row.avatar, createdAt: row.created_at,
          };
        }
      } catch {}
    }

    if (!found) {
      try {
        const isAddress = agentId.startsWith("0x") && agentId.length === 42;
        const query = isAddress
          ? supabase.from("hosted_agents").select("*").ilike("agent_wallet", agentId)
          : supabase.from("hosted_agents").select("*").eq("agent_nft_id", agentId);
        const { data } = await query;
        const row = data?.[0];
        if (row) {
          found = {
            id: row.agent_wallet, name: row.name, description: row.description || "",
            ownerAddress: row.owner_address || "", agentWallet: row.agent_wallet,
            agentPrivateKey: "", apiKey: row.api_key || "", apiKeyActive: true,
            agentNftId: row.agent_nft_id, serviceId: row.service_id,
            endpoint: "", tags: [], pricePerCall: "0", paymentToken: "",
            avatar: null, createdAt: new Date(row.created_at).getTime(),
          };
        }
      } catch {}
    }

    setAgent(found || null);
    setLoading(false);
    if (found) fetchData(found);
  }

  async function fetchData(a: RegisteredAgent) {
    const nftId = a.agentNftId;

    // Parallel fetches
    const [servicesRes, dealsRes, repRes, balRes, allServicesRes] = await Promise.all([
      fetch(`${API_URL}/v1/services`).catch(() => null),
      fetch(`${API_URL}/v1/deals`).catch(() => null),
      fetch(`${API_URL}/v1/reputation/leaderboard`).catch(() => null),
      fetch(`${API_URL}/v1/wallet/balance?ownerAddress=${a.agentWallet}`).catch(() => null),
      fetch(`${API_URL}/v1/services`).catch(() => null),
    ]);

    // Agent's own services
    if (servicesRes?.ok) {
      const all = await servicesRes.json();
      const mine = (all as Service[]).filter((s: any) => String(s.agentId) === String(nftId));
      setServices(mine);
      setAllServices(all);
    }

    // Deals involving this agent
    if (dealsRes?.ok) {
      const allDeals = await dealsRes.json();
      const myDeals = (allDeals as Deal[]).filter(
        (d: any) => String(d.buyerAgentId) === String(nftId) || String(d.sellerAgentId) === String(nftId)
      );
      setDeals(myDeals);
    }

    // Reputation
    if (repRes?.ok) {
      const lb = await repRes.json();
      const entry = (lb as any[]).find((e: any) => String(e.agentId) === String(nftId));
      if (entry) {
        setReputation({ score: entry.score || 0, completed: entry.jobsCompleted || 0, revenue: entry.revenue || "0" });
      }
    }

    // Wallet balance
    if (balRes?.ok) {
      const bal = await balRes.json();
      setWalletBalance(bal.balances || {});
    }
  }

  // Agent-to-Agent hire
  async function handleA2AHire() {
    if (!agent || !hireAgent.trim()) return;
    setHireLoading(true);
    setHireResult("");

    try {
      // Find target agent's service
      const targetService = allServices.find(
        (s: any) => String(s.agentId) === hireAgent.trim() || s.name.toLowerCase().includes(hireAgent.trim().toLowerCase())
      );

      if (!targetService) {
        setHireResult("Agent not found. Enter an agent ID (e.g. 1876) or name.");
        setHireLoading(false);
        return;
      }

      // Use agent's wallet to hire another agent
      const res = await fetch(`${API_URL}/v1/wallet/hire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: agent.agentWallet, // agent's own wallet
          serviceIndex: (targetService as any).serviceId,
          sellerAgentId: (targetService as any).agentId,
          paymentToken: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
          amount: targetService.pricePerCall,
          serviceName: targetService.name,
        }),
      });
      const data = await res.json();

      if (data.success || data.dealTxHash) {
        setHireResult(`Hired ${targetService.name} (Agent #${(targetService as any).agentId}). TX: ${data.dealTxHash?.slice(0, 20)}...`);
        fetchData(agent); // refresh
      } else {
        setHireResult(`Failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setHireResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setHireLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#F4C430] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-center px-4">
        <div>
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-white mb-2">Agent Not Found</h1>
          <p className="text-[#A1A1A1] mb-6 text-sm">Agent not found or not registered from this browser.</p>
          <Link href="/launch" className="px-6 py-3 rounded-xl gradient-btn font-medium">Launch an Agent</Link>
        </div>
      </div>
    );
  }

  const totalBalance = Object.values(walletBalance).reduce((sum, v) => sum + parseFloat(v || "0"), 0);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "offerings", label: "Offerings", count: services.length },
    { key: "jobs", label: "Job Log", count: deals.length },
    { key: "hire", label: "Hire Agent" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#F4C430]/20 to-[#F4C430]/5 border border-[#F4C430]/20 flex items-center justify-center text-2xl font-bold text-[#F4C430] flex-shrink-0">
            {agent.avatar ? <img src={agent.avatar} alt="" className="w-full h-full rounded-2xl object-cover" /> : agent.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{agent.name}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">Active</span>
              {agent.agentNftId && <span className="text-xs text-[#A1A1A1]">#{agent.agentNftId}</span>}
            </div>
            <p className="text-[#A1A1A1] text-sm mt-1 line-clamp-2">{agent.description}</p>
          </div>
          <Link href="/browse" className="text-[#A1A1A1] text-xs hover:text-white flex-shrink-0 hidden sm:block">← Back</Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-[#A1A1A1] mb-1">TrustScore</div>
            <div className="text-xl sm:text-2xl font-bold text-[#F4C430]">{reputation.score}</div>
          </div>
          <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-[#A1A1A1] mb-1">Deals</div>
            <div className="text-xl sm:text-2xl font-bold">{deals.length}</div>
          </div>
          <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-[#A1A1A1] mb-1">Revenue</div>
            <div className="text-xl sm:text-2xl font-bold text-[#F4C430]">${parseFloat(reputation.revenue).toFixed(2)}</div>
          </div>
          <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-[#A1A1A1] mb-1">Wallet Balance</div>
            <div className="text-xl sm:text-2xl font-bold">${totalBalance.toFixed(2)}</div>
          </div>
        </div>

        {/* Wallet Breakdown */}
        {totalBalance > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {Object.entries(walletBalance).map(([token, amount]) => parseFloat(amount) > 0 && (
              <div key={token} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs flex-shrink-0">
                <span className="text-[#A1A1A1]">{token}:</span> <span className="text-white font-medium">{parseFloat(amount).toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                tab === t.key
                  ? "border-[#F4C430] text-[#F4C430]"
                  : "border-transparent text-[#A1A1A1] hover:text-white"
              }`}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1.5 text-xs opacity-50">({t.count})</span>}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Identity */}
            <div className="p-4 sm:p-5 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-[#A1A1A1]">Identity</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[#A1A1A1] text-xs mb-0.5">Agent Wallet</div>
                  <code className="text-[#F4C430] font-mono text-xs break-all">{agent.agentWallet}</code>
                </div>
                <div>
                  <div className="text-[#A1A1A1] text-xs mb-0.5">ERC-8004 Token ID</div>
                  <span className="text-white font-mono">#{agent.agentNftId ?? "pending"}</span>
                </div>
                <div>
                  <div className="text-[#A1A1A1] text-xs mb-0.5">Owner</div>
                  <code className="text-[#A1A1A1] font-mono text-xs break-all">{agent.ownerAddress}</code>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-4 sm:p-5 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-[#A1A1A1]">Quick Actions</h3>
              <div className="space-y-2">
                <Link href={`/agents/${agent.agentNftId || agentId}`} className="block w-full py-2.5 rounded-lg bg-[#F4C430]/10 text-[#F4C430] text-sm text-center hover:bg-[#F4C430]/20 transition">
                  View Public Profile
                </Link>
                <Link href={`/chat?agent=${agent.agentNftId}&name=${encodeURIComponent(agent.name)}&mode=work`} className="block w-full py-2.5 rounded-lg bg-white/5 text-white text-sm text-center hover:bg-white/10 transition">
                  Chat with Agent
                </Link>
                <button onClick={() => setTab("hire")} className="block w-full py-2.5 rounded-lg bg-white/5 text-white text-sm text-center hover:bg-white/10 transition">
                  Hire Another Agent
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "offerings" && (
          <div className="space-y-3">
            {services.length === 0 ? (
              <div className="text-center py-12 text-[#A1A1A1]">
                <div className="text-3xl mb-2">📦</div>
                <p className="text-sm">No services registered on-chain yet.</p>
              </div>
            ) : (
              services.map((s) => (
                <div key={s.serviceId} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm truncate">{s.name}</h4>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${s.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-[#A1A1A1] text-xs mt-1 line-clamp-1">{s.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[#F4C430] font-bold text-sm">{parseFloat(formatUnits(BigInt(Math.round(parseFloat(s.pricePerCall) * 1e18)), 18)).toFixed(2)}</div>
                    <div className="text-[#A1A1A1] text-xs">USD</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "jobs" && (
          <div className="space-y-2">
            {deals.length === 0 ? (
              <div className="text-center py-12 text-[#A1A1A1]">
                <div className="text-3xl mb-2">📋</div>
                <p className="text-sm">No deals yet. Once your agent receives or makes jobs, they appear here.</p>
              </div>
            ) : (
              deals.map((d) => {
                const isSeller = String(d.sellerAgentId) === String(agent?.agentNftId);
                return (
                  <div key={d.dealId} className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isSeller ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400"}`}>
                          {isSeller ? "Seller" : "Buyer"}
                        </span>
                        <span className="text-sm font-medium">Deal #{d.dealId}</span>
                      </div>
                      <span className={`text-xs ${d.status === "completed" ? "text-green-400" : d.status === "active" ? "text-yellow-400" : "text-[#A1A1A1]"}`}>
                        {d.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#A1A1A1]">
                      <span>{isSeller ? `Buyer: Agent #${d.buyerAgentId}` : `Seller: Agent #${d.sellerAgentId}`}</span>
                      <span className="text-[#F4C430] font-medium">{d.amount} USD</span>
                    </div>
                    {d.createdAt && (
                      <div className="text-xs text-[#A1A1A1]/50 mt-1">
                        {new Date(d.createdAt * 1000).toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === "hire" && (
          <div className="p-5 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-semibold mb-2">Agent-to-Agent Hiring</h3>
            <p className="text-[#A1A1A1] text-sm mb-4">
              Your agent ({agent.name}) can hire other agents using its own wallet. Payment goes through on-chain escrow — same as human buyers.
            </p>

            <div className="mb-4 p-3 rounded-lg bg-[#F4C430]/5 border border-[#F4C430]/20 text-xs">
              <div className="text-[#F4C430] font-medium mb-1">Agent Wallet Balance</div>
              {Object.entries(walletBalance).length > 0 ? (
                Object.entries(walletBalance).map(([token, amount]) => (
                  <div key={token} className="text-[#A1A1A1]">{token}: {parseFloat(amount).toFixed(4)}</div>
                ))
              ) : (
                <div className="text-[#A1A1A1]">No balance. Deposit stablecoins to <code className="text-[#F4C430]">{agent.agentWallet.slice(0, 10)}...</code></div>
              )}
            </div>

            {/* Available agents to hire */}
            <div className="mb-4">
              <div className="text-xs text-[#A1A1A1] mb-2">Available Agents</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allServices.filter((s: any) => String(s.agentId) !== String(agent.agentNftId)).map((s: any) => (
                  <button
                    key={s.serviceId}
                    onClick={() => setHireAgent(String(s.agentId))}
                    className={`w-full p-3 rounded-lg border text-left text-sm transition ${
                      hireAgent === String(s.agentId)
                        ? "border-[#F4C430]/50 bg-[#F4C430]/5"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{s.name} <span className="text-[#A1A1A1] font-normal">#{s.agentId}</span></span>
                      <span className="text-[#F4C430] text-xs">{parseFloat(formatUnits(BigInt(Math.round(parseFloat(s.pricePerCall) * 1e18)), 18)).toFixed(2)} USD</span>
                    </div>
                    <p className="text-[#A1A1A1] text-xs mt-0.5 line-clamp-1">{s.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleA2AHire}
              disabled={hireLoading || !hireAgent}
              className="w-full py-3 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm disabled:opacity-30 hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition"
            >
              {hireLoading ? "Hiring..." : hireAgent ? `Hire Agent #${hireAgent}` : "Select an agent to hire"}
            </button>

            {hireResult && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${hireResult.includes("Hired") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {hireResult}
              </div>
            )}
          </div>
        )}

        {/* Manage via Chat */}
        <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10 text-center">
          <p className="text-[#A1A1A1] text-xs mb-2">Manage your agent via chat commands: /name, /desc, /price, /tags, /info</p>
          <Link href={`/chat?agent=${agent.agentNftId}&name=${encodeURIComponent(agent.name)}&mode=work`} className="text-[#F4C430] text-sm font-medium hover:underline">
            Open Agent Chat →
          </Link>
        </div>
      </div>
    </div>
  );
}
