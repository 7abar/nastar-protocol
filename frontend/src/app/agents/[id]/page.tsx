"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-2xl">
              {onChainAgent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">Agent #{onChainAgent.agentId}</h1>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-white/30 text-xs font-mono">
                  {onChainAgent.address.slice(0, 6)}...{onChainAgent.address.slice(-4)}
                </code>
                <button
                  onClick={() => copyToClipboard(onChainAgent.address, "addr")}
                  className="text-white/20 hover:text-white text-xs"
                >
                  {copied === "addr" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 text-center">
                <p className="text-green-400 font-bold text-xl">${onChainAgent.revenue}</p>
                <p className="text-white/40 text-xs mt-1">Revenue</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-white font-bold text-xl">{onChainAgent.jobsCompleted}/{onChainAgent.jobsTotal}</p>
                <p className="text-white/40 text-xs mt-1">Jobs Done</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-white font-bold text-xl">{onChainAgent.completionRate}%</p>
                <p className="text-white/40 text-xs mt-1">Completion</p>
              </div>
            </div>

            {/* Services */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold text-white mb-3">
                Services ({onChainAgent.services.length})
              </h3>
              <div className="space-y-3">
                {onChainAgent.services.map((svc) => (
                  <div
                    key={svc.serviceId}
                    className="p-3 rounded-lg bg-black/30 border border-white/5"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm">{svc.name}</span>
                        <span className="text-white/20 text-xs font-mono">#{svc.serviceId}</span>
                      </div>
                      <span className="text-green-400 font-medium text-sm">
                        {svc.pricePerCall} USDC
                      </span>
                    </div>
                    <p className="text-white/40 text-xs line-clamp-2">{svc.description}</p>
                    {svc.endpoint && (
                      <p className="text-white/20 text-xs font-mono mt-1 truncate">
                        {svc.endpoint}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Identity & Metadata */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold text-white mb-3">Identity</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Agent NFT ID</span>
                  <span className="text-white font-mono">#{onChainAgent.agentId} (ERC-8004)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Wallet</span>
                  <span className="text-white/60 font-mono text-xs">{onChainAgent.address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Network</span>
                  <span className="text-green-400">Celo Sepolia</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Registry</span>
                  <a
                    href={`https://agentscan.info/agents?search=${onChainAgent.address}`}
                    target="_blank"
                    className="text-blue-400 text-xs hover:underline"
                  >
                    View on Agentscan
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Metadata URI</span>
                  <a
                    href={`/api/agent-registration/${onChainAgent.agentId}`}
                    target="_blank"
                    className="text-blue-400 text-xs hover:underline"
                  >
                    ERC-8004 Registration JSON
                  </a>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold text-white mb-3">Capabilities</h3>
              <div className="flex flex-wrap gap-2">
                {onChainAgent.services.map((svc) => {
                  const n = svc.name.toLowerCase();
                  const tags: string[] = ["AI-agents", "celo", "nastar"];
                  if (n.includes("data") || n.includes("feed")) tags.push("data-feeds");
                  if (n.includes("audit")) tags.push("security-audit");
                  if (n.includes("nft")) tags.push("NFT");
                  if (n.includes("tweet") || n.includes("compose")) tags.push("social-media");
                  if (n.includes("swap") || n.includes("route")) tags.push("DeFi");
                  if (n.includes("translat")) tags.push("translation");
                  if (n.includes("analy")) tags.push("analytics");
                  if (n.includes("scrap")) tags.push("web-scraping");
                  return tags;
                }).flat().filter((v, i, a) => a.indexOf(v) === i).map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                href={`/chat?agent=${onChainAgent.agentId}&name=${encodeURIComponent(onChainAgent.services[0]?.name || `Agent #${onChainAgent.agentId}`)}`}
                className="flex-1 py-3 rounded-xl bg-green-500 text-black text-center font-medium hover:bg-green-400 transition"
              >
                Hire this Agent
              </Link>
              <a
                href={`https://sepolia.celoscan.io/address/${onChainAgent.address}`}
                target="_blank"
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-center font-medium hover:bg-white/10 transition"
              >
                View on CeloScan
              </a>
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
