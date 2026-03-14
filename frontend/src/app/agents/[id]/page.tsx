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

export default function AgentDetailPage() {
  const { id } = useParams();
  const { user } = usePrivy();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const agents = getStoredAgents();
    const found = agents.find((a) => a.id === id);
    setAgent(found || null);
  }, [id]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleRevokeApiKey() {
    if (!agent) return;
    if (!confirm("Revoke this API key? External integrations will stop working."))
      return;
    updateAgent(agent.id, { apiKeyActive: false });
    setAgent({ ...agent, apiKeyActive: false });
  }

  function handleGenerateNewKey() {
    if (!agent) return;
    const newKey = generateApiKey();
    updateAgent(agent.id, { apiKey: newKey, apiKeyActive: true });
    setAgent({ ...agent, apiKey: newKey, apiKeyActive: true });
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white/40">
        Agent not found.{" "}
        <Link href="/agents" className="text-green-400 ml-2 hover:underline">
          Back to Explorer
        </Link>
      </div>
    );
  }

  const isOwner =
    user?.wallet?.address?.toLowerCase() === agent.ownerAddress.toLowerCase();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Agent Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-2xl">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-white/30 text-xs font-mono">
                {agent.agentWallet.slice(0, 6)}...{agent.agentWallet.slice(-4)}
              </code>
              <button
                onClick={() => copyToClipboard(agent.agentWallet, "wallet")}
                className="text-white/20 hover:text-white text-xs"
              >
                {copied === "wallet" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Agent Name + Wallet */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <label className="text-white/40 text-xs uppercase tracking-wider">
                Agent Name
              </label>
              <p className="text-white font-medium mt-1">{agent.name}</p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <label className="text-white/40 text-xs uppercase tracking-wider">
                Agent Wallet Address
              </label>
              <p className="text-white font-mono text-sm mt-1 break-all">
                {agent.agentWallet}
              </p>
            </div>
          </div>

          {/* API Access — like the Virtuals screenshot */}
          {isOwner && (
            <div
              className={`p-4 rounded-xl border ${
                agent.apiKeyActive
                  ? "bg-white/5 border-green-500/30"
                  : "bg-white/5 border-white/10"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">API Access</h2>
              </div>

              {agent.apiKeyActive ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <span className="text-green-400 text-sm">&#128273;</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">
                        API Key Active
                      </p>
                      <p className="text-white/40 text-xs">
                        This agent has an active API key for external
                        integrations
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRevokeApiKey}
                    className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition"
                  >
                    Revoke API Key
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                  <div>
                    <p className="text-white/50 text-sm">No active API key</p>
                  </div>
                  <button
                    onClick={handleGenerateNewKey}
                    className="px-3 py-1.5 rounded-lg bg-green-500 text-black text-sm font-medium hover:bg-green-400 transition"
                  >
                    Generate New Key
                  </button>
                </div>
              )}

              {/* Show API Key */}
              {agent.apiKeyActive && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-black/50 px-3 py-2 rounded-lg text-green-400 break-all">
                      {showKey ? agent.apiKey : "nst_" + "•".repeat(36)}
                    </code>
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="text-white/30 hover:text-white text-xs"
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={() => copyToClipboard(agent.apiKey, "apikey")}
                      className="text-white/30 hover:text-white text-xs"
                    >
                      {copied === "apikey" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Setup Instructions — like Virtuals */}
          {isOwner && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold text-white mb-4">
                Give Your Agent Access to Nastar
              </h3>

              <SetupTabs apiKey={agent.apiKeyActive ? agent.apiKey : undefined} />
            </div>
          )}

          {/* Service Info */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-semibold text-white mb-3">Service Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Description</span>
                <span className="text-white text-right max-w-[60%]">
                  {agent.description}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Endpoint</span>
                <span className="text-white/60 font-mono text-xs break-all">
                  {agent.endpoint}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Price</span>
                <span className="text-green-400">{agent.pricePerCall} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Payment Token</span>
                <span className="text-white/60 font-mono text-xs">
                  {agent.paymentToken.slice(0, 6)}...
                  {agent.paymentToken.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Tags</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {agent.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded bg-white/5 text-white/40 text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Agent NFT ID</span>
                <span className="text-white font-mono">
                  #{agent.agentNftId ?? "pending"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Service ID</span>
                <span className="text-white font-mono">
                  #{agent.serviceId ?? "pending"}
                </span>
              </div>
            </div>
          </div>

          {/* CeloScan link */}
          <a
            href={`https://sepolia.celoscan.io/address/${agent.agentWallet}`}
            target="_blank"
            className="block text-center text-green-400 text-sm hover:underline"
          >
            View on CeloScan →
          </a>
        </div>
      </div>
    </div>
  );
}
