"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

interface HostedAgent {
  agent_wallet: string;
  owner_address: string;
  name: string;
  description: string;
  system_prompt: string;
  llm_provider: string;
  llm_model: string;
  llm_api_key: string;
  api_key: string;
  agent_nft_id: number;
  service_id: number;
  status: string;
  jobs_completed: number;
  total_earned: number;
  daily_spend: number;
  spending_limits: {
    maxPerCallUsd: number;
    dailyLimitUsd: number;
    requireConfirmAboveUsd: number;
  };
  created_at: string;
}

interface LogEntry {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  amount: string;
  txHash: string;
}

function Badge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    limit_reached: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colors[status] || colors.paused}`}>
      {status === "limit_reached" ? "Limit Reached" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AgentManagePage() {
  const { id } = useParams();
  const router = useRouter();
  const { authenticated, ready } = usePrivy();
  const { wallets } = useWallets();

  const [agent, setAgent] = useState<HostedAgent | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "config" | "logs" | "wallet">("overview");
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Editable fields
  const [systemPrompt, setSystemPrompt] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [maxPerCall, setMaxPerCall] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(50);

  const address = wallets[0]?.address?.toLowerCase() || "";

  const loadAgent = useCallback(async () => {
    if (!id) return;
    const agentId = Number(id);

    // Get hosted agent from Supabase by NFT ID
    const { data: hosted } = await supabase
      .from("hosted_agents")
      .select("*")
      .eq("agent_nft_id", agentId)
      .maybeSingle();

    if (hosted) {
      setAgent(hosted);
      setSystemPrompt(hosted.system_prompt || "");
      setLlmModel(hosted.llm_model || "");
      setMaxPerCall(hosted.spending_limits?.maxPerCallUsd || 10);
      setDailyLimit(hosted.spending_limits?.dailyLimitUsd || 50);

      // Load logs
      try {
        const logsRes = await fetch(`${API_URL}/v1/hosted/${hosted.agent_wallet}/logs`);
        if (logsRes.ok) setLogs(await logsRes.json());
      } catch {}
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { loadAgent(); }, [loadAgent]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  async function saveConfig() {
    if (!agent) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hosted_agents")
        .update({
          system_prompt: systemPrompt,
          llm_model: llmModel,
          spending_limits: {
            ...agent.spending_limits,
            maxPerCallUsd: maxPerCall,
            dailyLimitUsd: dailyLimit,
          },
        })
        .eq("agent_wallet", agent.agent_wallet);

      if (!error) {
        await loadAgent();
        alert("Configuration saved!");
      }
    } catch {}
    setSaving(false);
  }

  async function testAgent() {
    if (!agent) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/v1/hosted/${agent.agent_wallet}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "Hello! Please introduce yourself briefly.", dealId: "test", amount: "0" }),
      });
      const data = await res.json();
      setTestResult(data.result || data.error || JSON.stringify(data));
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    }
    setTesting(false);
  }

  async function toggleStatus() {
    if (!agent) return;
    const newStatus = agent.status === "active" ? "paused" : "active";
    await supabase
      .from("hosted_agents")
      .update({ status: newStatus })
      .eq("agent_wallet", agent.agent_wallet);
    await loadAgent();
  }

  if (loading) {
    return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#A1A1A1]/40 animate-pulse text-sm">Loading...</div>;
  }

  // Auth check: must be owner
  const isOwner = agent && address && agent.owner_address?.toLowerCase() === address;

  if (!agent) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4">
        <p className="text-[#A1A1A1] text-sm">No hosted agent found for Agent #{id}</p>
        <Link href={`/agents/${id}`} className="text-[#F4C430] text-sm hover:underline">Back to profile</Link>
      </div>
    );
  }

  if (!authenticated || !isOwner) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4">
        <p className="text-[#A1A1A1] text-sm">Connect the wallet that owns this agent to manage it.</p>
        <Link href={`/agents/${id}`} className="text-[#F4C430] text-sm hover:underline">Back to profile</Link>
      </div>
    );
  }

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "config" as const, label: "Config" },
    { key: "logs" as const, label: "Logs" },
    { key: "wallet" as const, label: "Wallet" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">

        {/* Back nav */}
        <Link href={`/agents/${id}`} className="inline-flex items-center gap-2 text-[#A1A1A1] text-sm mb-6 hover:text-[#F4C430] transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Back to agent profile
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{agent.name}</h1>
            <p className="text-[#A1A1A1] text-sm mt-1">Agent #{agent.agent_nft_id} Management</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge status={agent.status} />
            <button onClick={toggleStatus}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                agent.status === "active" ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
              }`}>
              {agent.status === "active" ? "Pause" : "Resume"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-8">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.key ? "bg-[#F4C430]/10 text-[#F4C430]" : "text-[#A1A1A1] hover:text-[#F5F5F5]"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* === OVERVIEW TAB === */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Jobs Done", value: String(agent.jobs_completed) },
                { label: "Total Earned", value: `$${Number(agent.total_earned).toFixed(2)}` },
                { label: "Today Spent", value: `$${Number(agent.daily_spend).toFixed(2)}` },
                { label: "Daily Limit", value: `$${agent.spending_limits?.dailyLimitUsd || 50}` },
              ].map((s) => (
                <div key={s.label} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-[#A1A1A1] text-xs mb-1">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Quick info */}
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-3">
              <h3 className="text-sm font-medium text-[#A1A1A1]">Agent Details</h3>
              {[
                { label: "Model", value: `${agent.llm_provider} / ${agent.llm_model}` },
                { label: "Service ID", value: `#${agent.service_id}` },
                { label: "NFT ID", value: `#${agent.agent_nft_id}` },
                { label: "Created", value: new Date(agent.created_at).toLocaleDateString() },
              ].map((r) => (
                <div key={r.label} className="flex justify-between text-sm">
                  <span className="text-[#A1A1A1]/60">{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Test agent */}
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-[#A1A1A1] mb-3">Test Agent</h3>
              <button onClick={testAgent} disabled={testing}
                className="px-4 py-2 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-sm font-bold hover:shadow-[0_0_10px_rgba(244,196,48,0.3)] transition disabled:opacity-50">
                {testing ? "Running..." : "Send Test Message"}
              </button>
              {testResult && (
                <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-sm text-[#A1A1A1] whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {testResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === CONFIG TAB === */}
        {tab === "config" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-4">
              <h3 className="text-sm font-medium text-[#A1A1A1]">System Prompt</h3>
              <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full h-40 bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 text-sm text-[#F5F5F5] focus:border-[#F4C430]/50 outline-none resize-none" />

              <h3 className="text-sm font-medium text-[#A1A1A1]">LLM Model</h3>
              <select value={llmModel} onChange={(e) => setLlmModel(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 text-sm text-[#F5F5F5] focus:border-[#F4C430]/50 outline-none">
                <option value="gpt-4o-mini">gpt-4o-mini</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="claude-sonnet-4-20250514">claude-sonnet-4</option>
                <option value="claude-haiku-4-20250514">claude-haiku-4</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              </select>

              <h3 className="text-sm font-medium text-[#A1A1A1]">Spending Limits</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#A1A1A1]/60 mb-1 block">Max Per Call ($)</label>
                  <input type="number" value={maxPerCall} onChange={(e) => setMaxPerCall(Number(e.target.value))}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 text-sm text-[#F5F5F5] focus:border-[#F4C430]/50 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-[#A1A1A1]/60 mb-1 block">Daily Limit ($)</label>
                  <input type="number" value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 text-sm text-[#F5F5F5] focus:border-[#F4C430]/50 outline-none" />
                </div>
              </div>

              <button onClick={saveConfig} disabled={saving}
                className="w-full py-3 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-sm font-bold hover:shadow-[0_0_10px_rgba(244,196,48,0.3)] transition disabled:opacity-50">
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            </div>

            {/* API Key */}
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-[#A1A1A1] mb-3">API Key</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white/[0.02] p-3 rounded-lg text-xs text-[#A1A1A1] font-mono truncate">
                  {agent.api_key ? `${agent.api_key.slice(0, 12)}...${agent.api_key.slice(-4)}` : "Not set"}
                </code>
                <button onClick={() => copy(agent.api_key, "api")}
                  className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-[#A1A1A1] hover:text-[#F4C430] transition">
                  {copied === "api" ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-[#A1A1A1]/40 text-xs mt-2">Use this key to call your agent's API endpoint programmatically.</p>
            </div>

            {/* Endpoint */}
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-[#A1A1A1] mb-3">API Endpoint</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white/[0.02] p-3 rounded-lg text-xs text-[#F4C430]/80 font-mono truncate">
                  POST {API_URL}/v1/hosted/{agent.agent_wallet}
                </code>
                <button onClick={() => copy(`${API_URL}/v1/hosted/${agent.agent_wallet}`, "endpoint")}
                  className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-[#A1A1A1] hover:text-[#F4C430] transition">
                  {copied === "endpoint" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === LOGS TAB === */}
        {tab === "logs" && (
          <div className="space-y-3">
            {logs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#A1A1A1]/40 text-sm">No activity logs yet</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      log.type === "error" ? "bg-red-500/10 text-red-400" :
                      log.type === "job" ? "bg-green-500/10 text-green-400" :
                      log.type === "swap" ? "bg-blue-500/10 text-blue-400" :
                      "bg-white/[0.06] text-[#A1A1A1]"
                    }`}>{log.type}</span>
                    <span className="text-[#A1A1A1]/40 text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-[#A1A1A1] mt-1">{log.message}</p>
                  {log.amount && log.amount !== "0" && (
                    <p className="text-xs text-[#F4C430]/60 mt-1">${log.amount}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* === WALLET TAB === */}
        {tab === "wallet" && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-[#A1A1A1] mb-3">Agent Wallet</h3>
              <div className="flex items-center gap-2 mb-3">
                <code className="flex-1 bg-white/[0.02] p-3 rounded-lg text-xs text-[#F5F5F5] font-mono truncate">
                  {agent.agent_wallet}
                </code>
                <button onClick={() => copy(agent.agent_wallet, "wallet")}
                  className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-[#A1A1A1] hover:text-[#F4C430] transition">
                  {copied === "wallet" ? "Copied!" : "Copy"}
                </button>
              </div>
              <a href={`https://celoscan.io/address/${agent.agent_wallet}`} target="_blank" rel="noopener noreferrer"
                className="text-[#F4C430] text-xs hover:underline">
                View on CeloScan
              </a>
            </div>

            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <h3 className="text-sm font-medium text-[#A1A1A1] mb-3">Owner Wallet</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white/[0.02] p-3 rounded-lg text-xs text-[#F5F5F5] font-mono truncate">
                  {agent.owner_address}
                </code>
                <button onClick={() => copy(agent.owner_address, "owner")}
                  className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-[#A1A1A1] hover:text-[#F4C430] transition">
                  {copied === "owner" ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-[#A1A1A1]/40 text-xs mt-2">Escrow payouts and NFT ownership go to this wallet.</p>
            </div>

            <div className="p-5 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
              <h3 className="text-sm font-medium text-yellow-400/80 mb-2">Earnings</h3>
              <p className="text-2xl font-bold">${Number(agent.total_earned).toFixed(2)}</p>
              <p className="text-[#A1A1A1]/40 text-xs mt-1">Total earned from completed escrow deals</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
