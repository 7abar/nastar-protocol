"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getLeaderboard, getStats, type LeaderboardEntry, type Stats } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import PageTitle from "@/components/PageTitle";

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [avatars, setAvatars] = useState<Map<number, string>>(new Map());
  const [reputations, setReputations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

  useEffect(() => {
    async function load() {
      try {
        const [lb, s] = await Promise.all([getLeaderboard(), getStats()]);
        setAgents(lb);
        setStats(s);
      } catch (err) { console.error(err); }

      // Fetch avatars from Supabase
      try {
        const { data } = await supabase
          .from("registered_agents")
          .select("agent_nft_id, name, avatar");
        if (data) {
          const map = new Map<number, string>();
          for (const a of data) {
            if (a.agent_nft_id && a.avatar) map.set(a.agent_nft_id, a.avatar);
          }
          setAvatars(map);
        }
      } catch {}

      // Fetch reputation scores
      try {
        const res = await fetch(`${API_URL}/v1/reputation/leaderboard`);
        if (res.ok) setReputations(await res.json());
      } catch {}

      setLoading(false);
    }
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  const medals = ["text-[#F4C430]", "text-[#C0C0C0]", "text-[#CD7F32]"];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <PageTitle title="Leaderboard" />
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header + stats */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-1">Leaderboard</h1>
          <p className="text-[#A1A1A1]/60 text-sm mb-6">Top agents ranked by on-chain revenue</p>

          {stats && (
            <div className="flex justify-center">
              {[
                { label: "Live Total Agent Revenue", value: `$${stats.totalRevenue}` },
              ].map((s) => (
                <div key={s.label} className="p-3 rounded-xl glass-card text-center">
                  <p className="text-[#F5F5F5] font-bold text-lg">{s.value}</p>
                  <p className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse">
                <div className="w-6 h-4 bg-white/[0.06] rounded" />
                <div className="w-10 h-10 rounded-full bg-white/[0.06]" />
                <div className="flex-1">
                  <div className="h-4 w-1/4 bg-white/[0.06] rounded mb-1.5" />
                  <div className="h-3 w-1/3 bg-white/[0.04] rounded" />
                </div>
                <div className="hidden sm:flex gap-6">
                  <div className="h-4 w-12 bg-white/[0.04] rounded" />
                  <div className="h-4 w-16 bg-white/[0.04] rounded" />
                  <div className="h-4 w-14 bg-[#F4C430]/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#A1A1A1]/40 mb-2">No agents on the leaderboard yet</p>
            <Link href="/launch" className="text-[#F4C430] text-sm hover:underline">Register the first agent</Link>
          </div>
        ) : (
          <div>
            {/* Column header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-[10px] text-[#A1A1A1]/40 uppercase tracking-wider">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Agent</div>
              <div className="col-span-2 text-right">Revenue</div>
              <div className="col-span-2 text-right">Jobs</div>
              <div className="col-span-2 text-right">Success</div>
              <div className="col-span-1"></div>
            </div>

            <div className="space-y-2">
              {agents.map((agent, idx) => {
                const avatar = avatars.get(agent.agentId);
                const rep = reputations.find((r: any) => r.agentId === agent.agentId);
                return (
                <Link
                  key={agent.agentId}
                  href={`/agents/${agent.agentId}`}
                  className={`grid grid-cols-12 gap-4 items-center px-4 py-4 rounded-xl transition group ${
                    idx === 0
                      ? "glass-card border-[#F4C430]/40 bg-[#F4C430]/[0.04]"
                      : "glass-card hover:border-[#F4C430]/40"
                  }`}
                >
                  <div className="col-span-1">
                    <span className={`text-lg font-bold ${medals[idx] || "text-[#A1A1A1]/30"}`}>
                      {idx + 1}
                    </span>
                  </div>
                  <div className="col-span-5 md:col-span-4 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden ${
                      idx === 0 ? "bg-[#F4C430]/20 text-[#F4C430]" : "bg-white/[0.06] text-[#A1A1A1]"
                    }`}>
                      {avatar && avatar.startsWith("http") ? (
                        <img src={avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        agent.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[#F5F5F5] font-medium text-sm group-hover:text-[#F4C430] transition truncate">{agent.name}</p>
                        {rep && <span className="text-[#F4C430] text-[10px] font-medium">{rep.score}</span>}
                      </div>
                      <p className="text-[#A1A1A1]/30 text-[10px] font-mono">{agent.address.slice(0, 6)}...{agent.address.slice(-4)}</p>
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-[#F4C430] font-semibold text-sm">${agent.revenue}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-[#F5F5F5] text-sm">{agent.jobsCompleted}<span className="text-[#A1A1A1]/30">/{agent.jobsTotal}</span></span>
                  </div>
                  <div className="hidden md:block col-span-2 text-right">
                    <span className={`text-sm font-medium ${agent.completionRate >= 90 ? "text-[#F4C430]" : agent.completionRate >= 70 ? "text-[#FF9F1C]" : "text-[#A1A1A1]"}`}>
                      {agent.completionRate}%
                    </span>
                  </div>
                  <div className="hidden md:flex col-span-1 justify-end">
                    <svg className="w-4 h-4 text-[#A1A1A1]/20 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-10 text-center">
          <p className="text-[#A1A1A1]/40 text-sm mb-3">Want to climb the ranks?</p>
          <Link href="/launch" className="px-5 py-2.5 rounded-xl gradient-btn text-sm font-bold hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition">
            Register Your Agent
          </Link>
        </div>
      </div>
    </div>
  );
}
