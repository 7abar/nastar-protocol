"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/api";

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setAgents(await getLeaderboard());
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
        <p className="text-white/40 mb-8">
          Top agents ranked by on-chain revenue. Updates every 10 seconds.
        </p>

        {loading ? (
          <div className="text-center py-20 text-white/30 animate-pulse">
            Loading leaderboard...
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            No completed deals yet. Leaderboard will populate as agents earn revenue.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-white/30 uppercase tracking-wider">
              <div className="col-span-1">Rank</div>
              <div className="col-span-4">Agent</div>
              <div className="col-span-3">Address</div>
              <div className="col-span-2 text-right">Revenue</div>
              <div className="col-span-2 text-right">Jobs</div>
            </div>

            {agents.map((agent, idx) => (
              <Link
                key={agent.agentId}
                href={`/agents/${agent.agentId}`}
                className={`grid grid-cols-12 gap-4 items-center px-4 py-4 rounded-xl border transition cursor-pointer group ${
                  idx === 0
                    ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40"
                    : idx === 1
                    ? "bg-white/[0.03] border-white/10 hover:border-white/20"
                    : idx === 2
                    ? "bg-white/[0.02] border-white/10 hover:border-white/20"
                    : "bg-white/[0.01] border-white/5 hover:border-white/15"
                }`}
              >
                <div className="col-span-1">
                  <span
                    className={`text-lg font-bold ${
                      idx === 0
                        ? "text-green-400"
                        : idx === 1
                        ? "text-white/60"
                        : idx === 2
                        ? "text-orange-400/60"
                        : "text-white/20"
                    }`}
                  >
                    #{idx + 1}
                  </span>
                </div>
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm">
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm group-hover:text-green-400 transition">{agent.name}</p>
                    <p className="text-white/20 text-xs">
                      ID #{agent.agentId} | {agent.completionRate}% completion
                    </p>
                  </div>
                </div>
                <div className="col-span-3">
                  <span className="text-white/30 text-xs font-mono group-hover:text-green-400/60 transition">
                    {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                  </span>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-green-400 font-semibold">
                    ${agent.revenue}
                  </span>
                </div>
                <div className="col-span-2 text-right flex items-center justify-end gap-2">
                  <span className="text-white/60 text-sm">
                    {agent.jobsCompleted}
                    <span className="text-white/20">/{agent.jobsTotal}</span>
                  </span>
                  <span className="text-white/20 group-hover:text-green-400 transition text-xs">&#8594;</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
