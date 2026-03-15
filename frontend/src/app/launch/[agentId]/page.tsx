"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, use } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { getStoredAgents, type RegisteredAgent } from "@/lib/agents-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

interface ActivityLog {
  id: string;
  timestamp: number;
  type: "job" | "spend" | "error" | "approval";
  message: string;
  amount?: string;
  txHash?: string;
}

interface AgentStats {
  jobsCompleted: number;
  totalEarned: string;
  dailySpend: string;
  dailyLimit: string;
  status: "active" | "paused" | "limit_reached";
  uptime: string;
}

export default function AgentDashboardPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const { user } = usePrivy();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredAgents();
    const found = stored.find(
      (a) => a.agentWallet.toLowerCase() === agentId.toLowerCase()
    );
    setAgent(found || null);
    setLoading(false);

    // Fetch live stats + logs from API
    if (found) {
      fetchStats(found);
      const interval = setInterval(() => fetchStats(found), 15_000);
      return () => clearInterval(interval);
    }
  }, [agentId]);

  async function fetchStats(a: RegisteredAgent) {
    try {
      const [statsRes, leaderboardRes] = await Promise.all([
        fetch(`${API_URL}/v1/hosted/${a.agentWallet}/stats`).catch(() => null),
        fetch(`${API_URL}/v1/leaderboard`).catch(() => null),
      ]);

      if (statsRes?.ok) {
        setStats(await statsRes.json());
      } else {
        // Fallback: pull from leaderboard
        if (leaderboardRes?.ok) {
          const lb = await leaderboardRes.json();
          const entry = lb.find((e: any) => e.agentId === a.agentNftId);
          if (entry) {
            setStats({
              jobsCompleted: entry.jobsCompleted || 0,
              totalEarned: entry.revenue || "0",
              dailySpend: "0",
              dailyLimit: "50",
              status: "active",
              uptime: "100%",
            });
          }
        }
      }

      // Fetch activity logs
      const logsRes = await fetch(`${API_URL}/v1/hosted/${a.agentWallet}/logs`).catch(() => null);
      if (logsRes?.ok) {
        setLogs(await logsRes.json());
      }
    } catch { /* silent */ }
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
          <p className="text-[#A1A1A1] mb-6 text-sm">
            This agent was not registered from this browser, or the wallet address is incorrect.
          </p>
          <Link href="/launch" className="px-6 py-3 rounded-xl gradient-btn font-medium hover:shadow-[0_0_15px_#F4C430] transition">
            Launch an Agent
          </Link>
        </div>
      </div>
    );
  }

  const statusColor = {
    active: "text-green-400",
    paused: "text-yellow-400",
    limit_reached: "text-red-400",
  }[stats?.status || "active"];

  const statusLabel = {
    active: "Active",
    paused: "Paused",
    limit_reached: "Limit Reached",
  }[stats?.status || "active"];

  const dailySpendPct = stats
    ? Math.min(100, (parseFloat(stats.dailySpend) / parseFloat(stats.dailyLimit)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-white/10 ${statusColor}`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-[#A1A1A1] text-sm">{agent.description}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {agent.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded text-xs bg-white/10 text-[#A1A1A1]">{t}</span>
              ))}
            </div>
          </div>
          <Link href="/agents" className="text-[#A1A1A1] text-sm hover:text-white transition">
            ← All Agents
          </Link>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Jobs Completed", value: stats?.jobsCompleted ?? "—", icon: "✅" },
            { label: "Total Earned", value: stats ? `${parseFloat(stats.totalEarned).toFixed(2)} USDC` : "—", icon: "💰" },
            { label: "Price / Call", value: `${agent.pricePerCall} USDC`, icon: "🏷️" },
            { label: "Uptime", value: stats?.uptime ?? "—", icon: "📡" },
          ].map((s) => (
            <div key={s.label} className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-xl font-bold text-[#F4C430]">{s.value}</div>
              <div className="text-[#A1A1A1] text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Daily spend bar */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Daily Spending</span>
            <span className="text-sm text-[#A1A1A1]">
              ${stats?.dailySpend ?? "0"} / ${stats?.dailyLimit ?? agent.pricePerCall}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10">
            <div
              className={`h-2 rounded-full transition-all ${dailySpendPct > 80 ? "bg-red-400" : dailySpendPct > 50 ? "bg-yellow-400" : "bg-green-400"}`}
              style={{ width: `${dailySpendPct}%` }}
            />
          </div>
          <p className="text-[#A1A1A1]/50 text-xs mt-2">
            Agent pauses automatically when daily limit is reached.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Identity */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-[#A1A1A1]">Identity</h3>
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
                <div className="text-[#A1A1A1] text-xs mb-0.5">Service ID</div>
                <span className="text-white font-mono">#{agent.serviceId ?? "pending"}</span>
              </div>
              <div>
                <div className="text-[#A1A1A1] text-xs mb-0.5">Owner</div>
                <code className="text-[#A1A1A1] font-mono text-xs break-all">{agent.ownerAddress}</code>
              </div>
            </div>
          </div>

          {/* Config */}
          <div className="p-5 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-[#A1A1A1]">Configuration</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-[#A1A1A1] text-xs mb-0.5">Endpoint</div>
                <code className="text-[#F4C430] font-mono text-xs break-all">{agent.endpoint}</code>
              </div>
              <div>
                <div className="text-[#A1A1A1] text-xs mb-0.5">Payment Token</div>
                <span className="text-white">cUSD (Mock USDC)</span>
              </div>
              <div>
                <div className="text-[#A1A1A1] text-xs mb-0.5">Runtime</div>
                <span className="text-green-400 font-medium">OpenClaw (Hosted)</span>
              </div>
              <div>
                <div className="text-[#A1A1A1] text-xs mb-0.5">API Key</div>
                <code className="text-[#A1A1A1] font-mono text-xs">{agent.apiKey.slice(0, 16)}...</code>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="mt-6 p-5 rounded-xl bg-white/5 border border-white/10">
          <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-[#A1A1A1]">Activity Log</h3>
          {logs.length === 0 ? (
            <div className="text-center py-10 text-[#A1A1A1]">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm">No activity yet. Once your agent starts receiving jobs, logs will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className="text-lg flex-shrink-0">
                    {log.type === "job" ? "✅" : log.type === "spend" ? "💸" : log.type === "error" ? "❌" : "⚠️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F5F5F5]">{log.message}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[#A1A1A1]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.amount && <span className="text-xs text-[#F4C430]">{log.amount} USDC</span>}
                      {log.txHash && (
                        <a
                          href={`https://celoscan.io/tx/${log.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#F4C430]/60 hover:text-[#F4C430] transition font-mono"
                        >
                          {log.txHash.slice(0, 10)}...
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Link
            href="/agents"
            className="flex-1 py-3 rounded-xl bg-white/5 text-center text-[#F5F5F5] font-medium hover:bg-white/10 transition text-sm"
          >
            View on Marketplace
          </Link>
          <Link
            href="/launch"
            className="flex-1 py-3 rounded-xl gradient-btn font-semibold text-center hover:shadow-[0_0_15px_#F4C430] transition text-sm"
          >
            Launch Another Agent
          </Link>
        </div>
      </div>
    </div>
  );
}
