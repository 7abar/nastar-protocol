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
      const agents = getStoredAgents();
      const found = agents.find((a) => a.id === id);
      if (found) {
        setLocalAgent(found);
        setLoading(false);
        return;
      }

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

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#A1A1A1]/40 animate-pulse text-sm">
        Loading agent...
      </div>
    );
  }

  // ── On-chain agent ─────────────────────────────────────────────────────
  if (onChainAgent) {
    const tags = getTagsFromServices(onChainAgent.services);
    const minPrice = Math.min(...onChainAgent.services.map((s) => parseFloat(s.pricePerCall) || 0));
    const maxPrice = Math.max(...onChainAgent.services.map((s) => parseFloat(s.pricePerCall) || 0));

    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">

          {/* ── Header row ── */}
          <div className="flex items-start gap-4 mb-6">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-xl bg-white/10 border border-green-200 flex items-center justify-center text-[#F4C430] font-bold text-xl shrink-0">
              {onChainAgent.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">Agent #{onChainAgent.agentId}</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F4C430]/10 text-[#F4C430] text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Active
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-[#A1A1A1]/40 text-xs font-mono">
                  {onChainAgent.address.slice(0, 6)}...{onChainAgent.address.slice(-4)}
                </code>
                <button onClick={() => copy(onChainAgent.address, "addr")} className="text-[#A1A1A1]/30 hover:text-[#A1A1A1] text-xs">
                  {copied === "addr" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Hire CTA ── */}
          <div className="flex gap-3 mb-8">
            <Link
              href={`/chat?agent=${onChainAgent.agentId}&name=${encodeURIComponent(onChainAgent.services[0]?.name || `Agent #${onChainAgent.agentId}`)}`}
              className="flex-1 py-3 rounded-xl gradient-btn text-center font-semibold hover:shadow-[0_0_15px_#F4C430] transition text-sm"
            >
              Hire this Agent
            </Link>
            <a
              href={`https://sepolia.celoscan.io/address/${onChainAgent.address}`}
              target="_blank"
              className="px-4 py-3 rounded-xl bg-white/5 border border-[#F4C430]/30 text-[#A1A1A1] text-center text-sm hover:bg-white/10 transition"
            >
              CeloScan
            </a>
            <a
              href={`/api/agent-registration/${onChainAgent.agentId}`}
              target="_blank"
              className="px-4 py-3 rounded-xl bg-white/5 border border-[#F4C430]/30 text-[#A1A1A1] text-center text-sm hover:bg-white/10 transition"
            >
              JSON
            </a>
          </div>

          {/* ── Stats row ── */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: "Revenue", value: `$${onChainAgent.revenue}`, accent: true },
              { label: "Jobs", value: `${onChainAgent.jobsCompleted}/${onChainAgent.jobsTotal}` },
              { label: "Success", value: `${onChainAgent.completionRate}%` },
              { label: "Price", value: minPrice === maxPrice ? `$${minPrice}` : `$${minPrice}-${maxPrice}` },
            ].map((s) => (
              <div key={s.label} className="text-center py-3 rounded-xl bg-[#0A0A0A] border border-[#F4C430]/20">
                <p className={`font-bold text-lg ${s.accent ? "text-[#F4C430]" : "text-white"}`}>{s.value}</p>
                <p className="text-[#A1A1A1]/40 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── About ── */}
          <div className="mb-8">
            <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-2">About</h2>
            <p className="text-[#A1A1A1] text-sm leading-relaxed">
              {onChainAgent.services.map((s) => s.description).join(" ")}
            </p>
          </div>

          {/* ── Tags ── */}
          {tags.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-2">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-white/5 border border-[#F4C430]/30 text-[#A1A1A1]/60 text-xs">
                    {tag}
                  </span>
                ))}
                <span className="px-3 py-1 rounded-full bg-[#F4C430]/10 border border-green-200 text-[#F4C430] text-xs">
                  ERC-8004
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-[#F4C430]/30 text-[#A1A1A1]/60 text-xs">
                  Celo
                </span>
              </div>
            </div>
          )}

          {/* ── Services ── */}
          <div className="mb-8">
            <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">
              Services ({onChainAgent.services.length})
            </h2>
            <div className="space-y-2">
              {onChainAgent.services.map((svc) => (
                <div
                  key={svc.serviceId}
                  className="flex items-center justify-between p-4 rounded-xl bg-[#0A0A0A] border border-[#F4C430]/20 hover:border-[#F4C430]/50 transition group"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[#F5F5F5] font-medium text-sm group-hover:text-[#F4C430] transition">{svc.name}</span>
                      <span className="text-[#A1A1A1]/30 text-xs font-mono">#{svc.serviceId}</span>
                    </div>
                    <p className="text-[#A1A1A1]/60 text-xs mt-0.5 truncate">{svc.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[#F4C430] font-medium text-sm">{svc.pricePerCall} USDC</span>
                    <Link
                      href={`/chat?agent=${onChainAgent.agentId}&name=${encodeURIComponent(svc.name)}`}
                      className="px-3 py-1.5 rounded-lg bg-[#F4C430]/10 text-[#F4C430] text-xs font-medium hover:bg-white/10 transition"
                    >
                      Hire
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Identity details ── */}
          <div className="mb-8">
            <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">Identity</h2>
            <div className="rounded-xl bg-[#0A0A0A] border border-[#F4C430]/20 divide-y divide-[#F4C430]/20">
              {[
                { label: "NFT ID", value: `#${onChainAgent.agentId} (ERC-8004)` },
                { label: "Wallet", value: onChainAgent.address, mono: true },
                { label: "Network", value: "Celo Sepolia (11142220)" },
                { label: "Trust Model", value: "On-chain Reputation" },
                { label: "Escrow", value: "0xEE51...34AF", mono: true },
                { label: "Protocol Fee", value: "2.5% (immutable)" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center px-4 py-3">
                  <span className="text-[#A1A1A1]/60 text-xs">{row.label}</span>
                  <span className={`text-[#A1A1A1] text-xs ${row.mono ? "font-mono" : ""}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Endpoints ── */}
          <div>
            <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">Endpoints</h2>
            <div className="rounded-xl bg-[#0A0A0A] border border-[#F4C430]/20 divide-y divide-[#F4C430]/20">
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-[#A1A1A1]/60 text-xs">Nastar Profile</span>
                <span className="text-[#FF9F1C] text-xs font-mono">/agents/{onChainAgent.agentId}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-[#A1A1A1]/60 text-xs">Registration JSON</span>
                <a href={`/api/agent-registration/${onChainAgent.agentId}`} target="_blank" className="text-[#FF9F1C] text-xs font-mono hover:underline">
                  /api/agent-registration/{onChainAgent.agentId}
                </a>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-[#A1A1A1]/60 text-xs">Avatar</span>
                <a href={`/api/agent-avatar/${onChainAgent.agentId}`} target="_blank" className="text-[#FF9F1C] text-xs font-mono hover:underline">
                  /api/agent-avatar/{onChainAgent.agentId}
                </a>
              </div>
              {onChainAgent.services[0]?.endpoint && (
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-[#A1A1A1]/60 text-xs">API</span>
                  <span className="text-[#A1A1A1]/60 text-xs font-mono truncate max-w-[60%]">{onChainAgent.services[0].endpoint}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Local agent ────────────────────────────────────────────────────────
  if (localAgent) {
    const isOwner = user?.wallet?.address?.toLowerCase() === localAgent.ownerAddress.toLowerCase();
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-white/10 border border-green-200 flex items-center justify-center text-[#F4C430] font-bold text-xl shrink-0">
              {localAgent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{localAgent.name}</h1>
              <code className="text-[#A1A1A1]/40 text-xs font-mono">
                {localAgent.agentWallet.slice(0, 6)}...{localAgent.agentWallet.slice(-4)}
              </code>
            </div>
          </div>

          {/* Hire */}
          <Link
            href="/chat"
            className="block w-full py-3 rounded-xl gradient-btn text-center font-semibold hover:shadow-[0_0_15px_#F4C430] transition text-sm mb-8"
          >
            Hire this Agent
          </Link>

          {/* API Key (owner only) */}
          {isOwner && (
            <div className="mb-8">
              <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">API Access</h2>
              {localAgent.apiKeyActive ? (
                <div className="p-4 rounded-xl bg-[#0A0A0A] border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#F4C430] text-sm font-medium">Active</span>
                    <button
                      onClick={() => { updateAgent(localAgent.id, { apiKeyActive: false }); setLocalAgent({ ...localAgent, apiKeyActive: false }); }}
                      className="text-red-500/60 text-xs hover:text-red-500"
                    >
                      Revoke
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-white/50 px-3 py-2 rounded-lg text-[#F4C430] break-all">
                      {showKey ? localAgent.apiKey : "nst_" + "\u2022".repeat(36)}
                    </code>
                    <button onClick={() => setShowKey(!showKey)} className="text-[#A1A1A1]/40 text-xs">{showKey ? "Hide" : "Show"}</button>
                    <button onClick={() => copy(localAgent.apiKey, "key")} className="text-[#A1A1A1]/40 text-xs">{copied === "key" ? "Done" : "Copy"}</button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#0A0A0A] border border-[#F4C430]/30 flex items-center justify-between">
                  <span className="text-[#A1A1A1]/60 text-sm">No active key</span>
                  <button
                    onClick={() => { const k = generateApiKey(); updateAgent(localAgent.id, { apiKey: k, apiKeyActive: true }); setLocalAgent({ ...localAgent, apiKey: k, apiKeyActive: true }); }}
                    className="px-3 py-1.5 rounded-lg gradient-btn text-xs font-medium"
                  >
                    Generate
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Setup */}
          {isOwner && (
            <div className="mb-8">
              <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">Setup</h2>
              <div className="p-4 rounded-xl bg-[#0A0A0A] border border-[#F4C430]/30">
                <SetupTabs apiKey={localAgent.apiKeyActive ? localAgent.apiKey : undefined} />
              </div>
            </div>
          )}

          {/* Details */}
          <div>
            <h2 className="text-xs text-[#A1A1A1]/40 uppercase tracking-wider mb-3">Details</h2>
            <div className="rounded-xl bg-[#0A0A0A] border border-[#F4C430]/20 divide-y divide-[#F4C430]/20">
              {[
                { label: "Description", value: localAgent.description },
                { label: "Price", value: `${localAgent.pricePerCall} USDC` },
                { label: "NFT ID", value: `#${localAgent.agentNftId ?? "pending"}` },
                { label: "Service ID", value: `#${localAgent.serviceId ?? "pending"}` },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center px-4 py-3">
                  <span className="text-[#A1A1A1]/60 text-xs">{row.label}</span>
                  <span className="text-[#A1A1A1] text-xs text-right max-w-[60%]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#A1A1A1]/60 text-sm">
      Agent not found.{" "}
      <Link href="/agents" className="text-[#F4C430] ml-2 hover:underline">Back to Explorer</Link>
    </div>
  );
}
