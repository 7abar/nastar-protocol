"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getStoredAgents,
  updateAgent,
  generateApiKey,
  type RegisteredAgent,
} from "@/lib/agents-api";
import { SetupTabs } from "@/components/SetupTabs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

interface OnChainAgent {
  agentId: number;
  name: string;
  description: string;
  address: string;
  services: {
    serviceId: number;
    name: string;
    description: string;
    endpoint: string;
    pricePerCall: string;
    active: boolean;
  }[];
  revenue: string;
  jobsCompleted: number;
  jobsTotal: number;
  completionRate: number;
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const { user } = usePrivy();
  const [localAgent, setLocalAgent] = useState<RegisteredAgent | null>(null);
  const [onChainAgent, setOnChainAgent] = useState<OnChainAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Try localStorage first
      const agents = getStoredAgents();
      const found = agents.find((a) => a.id === id);
      if (found) {
        setLocalAgent(found);
        setLoading(false);
        return;
      }

      // Fetch from API (on-chain data)
      try {
        const [servicesRes, lbRes] = await Promise.all([
          fetch(`${API_URL}/v1/services`),
          fetch(`${API_URL}/v1/leaderboard`),
        ]);
        const services = await servicesRes.json();
        const leaderboard = await lbRes.json();

        // Find services for this agentId
        const agentId = Number(id);
        const agentServices = services.filter((s: any) => s.agentId === agentId);

        if (agentServices.length > 0) {
          const lb = leaderboard.find((a: any) => a.agentId === agentId);
          setOnChainAgent({
            agentId,
            name: agentServices[0].name.split("-")[0] || `Agent #${agentId}`,
            description: agentServices[0].description,
            address: agentServices[0].provider,
            services: agentServices.map((s: any) => ({
              serviceId: s.serviceId,
              name: s.name,
              description: s.description,
              endpoint: s.endpoint,
              pricePerCall: s.pricePerCall,
              active: s.active,
            })),
            revenue: lb?.revenue || "0",
            jobsCompleted: lb?.jobsCompleted || 0,
            jobsTotal: lb?.jobsTotal || 0,
            completionRate: lb?.completionRate || 0,
          });
        }
      } catch (err) {
        console.error("Failed to fetch agent:", err);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white/30 animate-pulse">
        Loading agent...
      </div>
    );
  }

  // ── On-chain agent view ────────────────────────────────────────────────
  if (onChainAgent) {
    const allTags = onChainAgent.services.map((svc) => {
      const n = svc.name.toLowerCase();
      const tags: string[] = [];
      if (n.includes("data") || n.includes("feed")) tags.push("data-feeds");
      if (n.includes("audit")) tags.push("security-audit");
      if (n.includes("nft")) tags.push("NFT");
      if (n.includes("tweet") || n.includes("compose")) tags.push("social-media");
      if (n.includes("swap") || n.includes("route")) tags.push("DeFi");
      if (n.includes("translat")) tags.push("translation");
      if (n.includes("analy")) tags.push("analytics");
      if (n.includes("scrap")) tags.push("web-scraping");
      return tags;
    }).flat().filter((v, i, a) => a.indexOf(v) === i);

    const minPrice = Math.min(...onChainAgent.services.map((s) => parseFloat(s.pricePerCall) || 0));
    const maxPrice = Math.max(...onChainAgent.services.map((s) => parseFloat(s.pricePerCall) || 0));
    const priceRange = minPrice === maxPrice ? `${minPrice} USDC` : `${minPrice} - ${maxPrice} USDC`;

    return (
      <div className="min-h-screen bg-black text-white">
        {/* Hero banner */}
        <div className="border-b border-white/10 bg-gradient-to-b from-green-500/5 to-transparent">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              {/* Avatar + info */}
              <div className="flex items-start gap-4 flex-1">
                <div className="w-20 h-20 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center text-green-400 font-bold text-3xl shrink-0">
                  {onChainAgent.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold">Agent #{onChainAgent.agentId}</h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <code className="text-white/30 text-xs font-mono">
                      {onChainAgent.address.slice(0, 6)}...{onChainAgent.address.slice(-4)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(onChainAgent.address, "addr")}
                      className="text-white/20 hover:text-white text-xs"
                    >
                      {copied === "addr" ? "Copied!" : "Copy"}
                    </button>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Active
                    </span>
                  </div>
                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {allTags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* CTA — always visible, no scroll needed */}
              <div className="flex flex-col gap-2 md:w-56 shrink-0">
                <Link
                  href={`/chat?agent=${onChainAgent.agentId}&name=${encodeURIComponent(onChainAgent.services[0]?.name || `Agent #${onChainAgent.agentId}`)}`}
                  className="py-3 rounded-xl bg-green-500 text-black text-center font-semibold hover:bg-green-400 transition text-sm"
                >
                  Hire this Agent
                </Link>
                <div className="flex gap-2">
                  <a
                    href={`https://sepolia.celoscan.io/address/${onChainAgent.address}`}
                    target="_blank"
                    className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-center text-xs hover:bg-white/10 transition"
                  >
                    CeloScan
                  </a>
                  <a
                    href={`https://agentscan.info/agents?search=${onChainAgent.address}`}
                    target="_blank"
                    className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-center text-xs hover:bg-white/10 transition"
                  >
                    Agentscan
                  </a>
                </div>
                <p className="text-white/20 text-xs text-center">
                  {priceRange} per call
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column — stats + identity */}
            <div className="space-y-4">
              {/* Stats */}
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                <h3 className="text-xs text-white/30 uppercase tracking-wider mb-3">Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-sm">Revenue</span>
                    <span className="text-green-400 font-bold text-lg">${onChainAgent.revenue}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-sm">Jobs Done</span>
                    <span className="text-white font-bold">{onChainAgent.jobsCompleted}/{onChainAgent.jobsTotal}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-sm">Completion</span>
                    <span className="text-white font-bold">{onChainAgent.completionRate}%</span>
                  </div>
                </div>
              </div>

              {/* Identity */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="text-xs text-white/30 uppercase tracking-wider mb-3">Identity</h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/40">NFT ID</span>
                    <span className="text-white font-mono text-xs">#{onChainAgent.agentId} (ERC-8004)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Network</span>
                    <span className="text-green-400 text-xs">Celo Sepolia</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Metadata</span>
                    <a
                      href={`/api/agent-registration/${onChainAgent.agentId}`}
                      target="_blank"
                      className="text-blue-400 text-xs hover:underline"
                    >
                      View JSON
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Trust</span>
                    <span className="text-white/60 text-xs">Reputation-based</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column — services */}
            <div className="lg:col-span-2">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">
                    Services ({onChainAgent.services.length})
                  </h3>
                  <span className="text-white/20 text-xs">Escrow-protected</span>
                </div>
                <div className="space-y-3">
                  {onChainAgent.services.map((svc) => (
                    <div
                      key={svc.serviceId}
                      className="p-4 rounded-lg bg-black/30 border border-white/5 hover:border-green-500/20 transition group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium text-sm group-hover:text-green-400 transition">{svc.name}</span>
                            <span className="text-white/15 text-xs font-mono">#{svc.serviceId}</span>
                          </div>
                        </div>
                        <span className="text-green-400 font-semibold text-sm whitespace-nowrap ml-3">
                          {svc.pricePerCall} USDC
                        </span>
                      </div>
                      <p className="text-white/40 text-sm leading-relaxed mb-2">{svc.description}</p>
                      <div className="flex items-center justify-between">
                        {svc.endpoint && (
                          <p className="text-white/15 text-xs font-mono truncate max-w-[60%]">
                            {svc.endpoint}
                          </p>
                        )}
                        <Link
                          href={`/chat?agent=${onChainAgent.agentId}&name=${encodeURIComponent(svc.name)}`}
                          className="px-3 py-1 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium hover:bg-green-500/20 transition ml-auto"
                        >
                          Hire
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Local agent view (registered via web) ──────────────────────────────
  if (localAgent) {
    const isOwner =
      user?.wallet?.address?.toLowerCase() === localAgent.ownerAddress.toLowerCase();

    return (
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-2xl">
              {localAgent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{localAgent.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-white/30 text-xs font-mono">
                  {localAgent.agentWallet.slice(0, 6)}...{localAgent.agentWallet.slice(-4)}
                </code>
                <button
                  onClick={() => copyToClipboard(localAgent.agentWallet, "wallet")}
                  className="text-white/20 hover:text-white text-xs"
                >
                  {copied === "wallet" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* API Access */}
            {isOwner && (
              <div className={`p-4 rounded-xl border ${localAgent.apiKeyActive ? "bg-white/5 border-green-500/30" : "bg-white/5 border-white/10"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">API Access</h2>
                </div>
                {localAgent.apiKeyActive ? (
                  <>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div>
                        <p className="text-white text-sm font-medium">API Key Active</p>
                        <p className="text-white/40 text-xs">For external integrations</p>
                      </div>
                      <button
                        onClick={() => {
                          updateAgent(localAgent.id, { apiKeyActive: false });
                          setLocalAgent({ ...localAgent, apiKeyActive: false });
                        }}
                        className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition"
                      >
                        Revoke
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <code className="flex-1 text-sm font-mono bg-black/50 px-3 py-2 rounded-lg text-green-400 break-all">
                        {showKey ? localAgent.apiKey : "nst_" + "\u2022".repeat(36)}
                      </code>
                      <button onClick={() => setShowKey(!showKey)} className="text-white/30 hover:text-white text-xs">
                        {showKey ? "Hide" : "Show"}
                      </button>
                      <button onClick={() => copyToClipboard(localAgent.apiKey, "key")} className="text-white/30 hover:text-white text-xs">
                        {copied === "key" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-white/50 text-sm">No active API key</p>
                    <button
                      onClick={() => {
                        const newKey = generateApiKey();
                        updateAgent(localAgent.id, { apiKey: newKey, apiKeyActive: true });
                        setLocalAgent({ ...localAgent, apiKey: newKey, apiKeyActive: true });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-green-500 text-black text-sm font-medium hover:bg-green-400 transition"
                    >
                      Generate New Key
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Setup */}
            {isOwner && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="font-semibold text-white mb-4">Give Your Agent Access to Nastar</h3>
                <SetupTabs apiKey={localAgent.apiKeyActive ? localAgent.apiKey : undefined} />
              </div>
            )}

            {/* Details */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold text-white mb-3">Service Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-white/40">Description</span><span className="text-white text-right max-w-[60%]">{localAgent.description}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Price</span><span className="text-green-400">{localAgent.pricePerCall} USDC</span></div>
                <div className="flex justify-between"><span className="text-white/40">Agent NFT ID</span><span className="text-white font-mono">#{localAgent.agentNftId ?? "pending"}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Service ID</span><span className="text-white font-mono">#{localAgent.serviceId ?? "pending"}</span></div>
              </div>
            </div>

            <a href={`https://sepolia.celoscan.io/address/${localAgent.agentWallet}`} target="_blank" className="block text-center text-green-400 text-sm hover:underline">
              View on CeloScan
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-white/40">
      Agent not found.{" "}
      <Link href="/agents" className="text-green-400 ml-2 hover:underline">
        Back to Explorer
      </Link>
    </div>
  );
}
