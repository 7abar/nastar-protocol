"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, use, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import Link from "next/link";
import { getStoredAgents, type RegisteredAgent } from "@/lib/agents-api";
import { supabase } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Service {
  serviceId: number;
  agentId: number;
  name: string;
  description: string;
  pricePerCall: string;
  active: boolean;
}

interface Job {
  id: string;
  buyer_address: string;
  seller_agent_id: number;
  offering_name: string;
  requirements: Record<string, any>;
  phase: string;
  amount_usd: number;
  deal_id?: number;
  deal_tx_hash?: string;
  deliverable?: string;
  delivery_proof?: string;
  memo_history: { phase: string; message: string; ts: number }[];
  payment_request?: { amount: string; token: string; usd_value: number; message: string };
  created_at: string;
}

type Tab = "overview" | "offerings" | "jobs" | "hire";

const PHASE_COLOR: Record<string, string> = {
  OPEN:        "text-yellow-400 bg-yellow-400/10",
  NEGOTIATION: "text-blue-400 bg-blue-400/10",
  IN_PROGRESS: "text-purple-400 bg-purple-400/10",
  COMPLETED:   "text-green-400 bg-green-400/10",
  REJECTED:    "text-red-400 bg-red-400/10",
  EXPIRED:     "text-gray-400 bg-gray-400/10",
};
const PHASE_LABEL: Record<string, string> = {
  OPEN: "Pending", NEGOTIATION: "Payment Review",
  IN_PROGRESS: "Working", COMPLETED: "Delivered",
  REJECTED: "Rejected", EXPIRED: "Expired",
};
const PHASE_STEPS = ["OPEN","NEGOTIATION","IN_PROGRESS","COMPLETED"];

// ─── Phase Timeline ───────────────────────────────────────────────────────────

function PhaseBar({ phase }: { phase: string }) {
  const idx = PHASE_STEPS.indexOf(phase);
  const terminal = ["REJECTED","EXPIRED"].includes(phase);
  return (
    <div className="flex items-center w-full mb-3">
      {PHASE_STEPS.map((p, i) => {
        const done = !terminal && i <= idx;
        const active = p === phase && !terminal;
        return (
          <div key={p} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center border-2 transition ${
                done ? "bg-[#F4C430] border-[#F4C430] text-[#0A0A0A]" :
                active ? "border-[#F4C430] text-[#F4C430] bg-[#F4C430]/10" :
                "border-white/20 text-[#A1A1A1]/40"}`}>
                {done ? "✓" : i+1}
              </div>
              <span className={`text-[9px] mt-0.5 whitespace-nowrap ${done||active?"text-[#F4C430]":"text-[#A1A1A1]/30"}`}>
                {PHASE_LABEL[p]}
              </span>
            </div>
            {i < PHASE_STEPS.length-1 && (
              <div className={`h-px flex-1 mx-1 mt-[-10px] ${!terminal && i < idx ? "bg-[#F4C430]" : "bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job, agentNftId, ownerAddress, onRefresh }: {
  job: Job; agentNftId: number; ownerAddress: string; onRefresh: () => void;
}) {
  const isSeller = job.seller_agent_id === agentNftId;
  const [open, setOpen] = useState(["NEGOTIATION","COMPLETED"].includes(job.phase));
  const [paying, setPaying] = useState(false);

  async function approvePay() {
    setPaying(true);
    try {
      const res = await fetch(`${API}/v1/jobs/${job.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true, ownerAddress }),
      });
      const d = await res.json();
      if (d.success) onRefresh();
      else alert(d.error || "Payment failed");
    } catch (e: any) { alert(e.message); }
    setPaying(false);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="p-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${PHASE_COLOR[job.phase] || ""}`}>
              {PHASE_LABEL[job.phase] || job.phase}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${
              isSeller ? "border-green-500/20 text-green-400" : "border-blue-500/20 text-blue-400"
            }`}>{isSeller ? "Seller" : "Buyer"}</span>
            <span className="text-xs font-semibold truncate">{job.offering_name}</span>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[#F4C430] text-xs font-bold">${job.amount_usd?.toFixed(2)}</div>
            <div className="text-[#A1A1A1]/40 text-[10px]">{new Date(job.created_at).toLocaleDateString()}</div>
          </div>
        </div>
        <PhaseBar phase={job.phase} />
        {job.requirements?.task && (
          <p className="text-[#A1A1A1] text-[11px] line-clamp-1">{job.requirements.task}</p>
        )}
      </div>

      {open && (
        <div className="border-t border-white/[0.06] p-3 space-y-2">

          {/* NEGOTIATION: approve payment */}
          {job.phase === "NEGOTIATION" && job.payment_request && !isSeller && (
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <div className="text-blue-400 text-xs font-semibold mb-1">Payment Request</div>
              <p className="text-[#A1A1A1] text-xs mb-2">{job.payment_request.message}</p>
              <p className="text-xs mb-2">Amount: <span className="text-[#F4C430] font-bold">${job.amount_usd?.toFixed(2)} USD</span> — locked in escrow</p>
              <button
                onClick={approvePay}
                disabled={paying}
                className="w-full py-2 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold disabled:opacity-50 transition"
              >
                {paying ? "Approving..." : `Approve & Lock $${job.amount_usd?.toFixed(2)} in Escrow`}
              </button>
            </div>
          )}

          {/* IN_PROGRESS */}
          {job.phase === "IN_PROGRESS" && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-purple-400 text-xs">{isSeller ? "Executing task..." : "Agent is working..."}</span>
            </div>
          )}

          {/* COMPLETED: deliverable */}
          {job.phase === "COMPLETED" && job.deliverable && (
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <div className="text-green-400 text-xs font-semibold mb-1.5">Deliverable</div>
              <div className="text-sm text-[#F5F5F5] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {job.deliverable}
              </div>
              {job.delivery_proof && (
                <div className="mt-1.5 text-[#A1A1A1]/40 text-[10px]">{job.delivery_proof}</div>
              )}
              {job.deal_tx_hash && (
                <a href={`https://celoscan.io/tx/${job.deal_tx_hash}`} target="_blank"
                  className="block mt-1.5 text-[10px] text-[#F4C430] hover:underline">
                  View on CeloScan →
                </a>
              )}
            </div>
          )}

          {/* Activity */}
          {job.memo_history?.length > 0 && (
            <div className="space-y-1">
              {job.memo_history.map((m, i) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <span className="text-[#A1A1A1]/30 flex-shrink-0">{new Date(m.ts).toLocaleTimeString()}</span>
                  <span className={`px-1 py-0.5 rounded text-[9px] flex-shrink-0 ${PHASE_COLOR[m.phase] || ""}`}>{m.phase}</span>
                  <span className="text-[#A1A1A1]/60">{m.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentDashboardPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const { wallets } = useWallets();
  const [agent, setAgent] = useState<RegisteredAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  // Per-agent data
  const [services, setServices] = useState<Service[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [reputation, setReputation] = useState({ score: 0, completed: 0, revenue: "0" });
  const [walletBalance, setWalletBalance] = useState<Record<string, string>>({});

  // A2A hire
  const [hireAgentId, setHireAgentId] = useState("");
  const [hireLoading, setHireLoading] = useState(false);
  const [hireResult, setHireResult] = useState("");

  const ownerAddress = wallets?.[0]?.address || "";

  useEffect(() => { loadAgent(); }, [agentId]);

  async function loadAgent() {
    const stored = getStoredAgents();
    let found = stored.find((a) => a.agentWallet.toLowerCase() === agentId.toLowerCase());

    if (!found) {
      try {
        const isAddr = agentId.startsWith("0x") && agentId.length === 42;
        for (const table of ["registered_agents", "hosted_agents"]) {
          const q = isAddr
            ? supabase.from(table).select("*").ilike("agent_wallet", agentId)
            : supabase.from(table).select("*").eq("agent_nft_id", agentId);
          const { data } = await q;
          if (data?.[0]) {
            const r = data[0];
            found = {
              id: r.agent_wallet || r.id, name: r.name, description: r.description || "",
              ownerAddress: r.owner_address || "", agentWallet: r.agent_wallet,
              agentPrivateKey: "", apiKey: r.api_key || "", apiKeyActive: r.api_key_active ?? true,
              agentNftId: r.agent_nft_id, serviceId: r.service_id,
              endpoint: r.endpoint || "", tags: r.tags || [],
              pricePerCall: r.price_per_call || "0", paymentToken: r.payment_token || "",
              avatar: r.avatar || null, createdAt: new Date(r.created_at).getTime(),
            };
            break;
          }
        }
      } catch {}
    }

    setAgent(found || null);
    setLoading(false);
    if (found) fetchAgentData(found);
  }

  const fetchAgentData = useCallback(async (a: RegisteredAgent) => {
    const nftId = a.agentNftId;

    const [svcRes, allSvcRes, repRes, balRes, jobsRes] = await Promise.allSettled([
      fetch(`${API}/v1/services`),
      fetch(`${API}/v1/services`),
      fetch(`${API}/v1/reputation/leaderboard`),
      fetch(`${API}/v1/wallet/balance?ownerAddress=${a.agentWallet}`),
      fetch(`${API}/v1/jobs?sellerAgentId=${nftId}&limit=50`),
    ]);

    if (svcRes.status === "fulfilled" && svcRes.value.ok) {
      const all: Service[] = await svcRes.value.json();
      setServices(all.filter((s) => String(s.agentId) === String(nftId)));
      setAllServices(all.filter((s) => String(s.agentId) !== String(nftId)));
    }

    if (repRes.status === "fulfilled" && repRes.value.ok) {
      const lb = await repRes.value.json();
      const entry = lb.find((e: any) => String(e.agentId) === String(nftId));
      if (entry) setReputation({ score: entry.score||0, completed: entry.jobsCompleted||0, revenue: entry.revenue||"0" });
    }

    if (balRes.status === "fulfilled" && balRes.value.ok) {
      const bal = await balRes.value.json();
      setWalletBalance(bal.balances || {});
    }

    if (jobsRes.status === "fulfilled" && jobsRes.value.ok) {
      const d = await jobsRes.value.json();
      setJobs(d.jobs || []);
    }
  }, []);

  async function refreshJobs(a: RegisteredAgent) {
    const res = await fetch(`${API}/v1/jobs?sellerAgentId=${a.agentNftId}&limit=50`);
    if (res.ok) { const d = await res.json(); setJobs(d.jobs || []); }
  }

  // A2A hire this agent's wallet hires another
  async function handleA2AHire() {
    if (!agent || !hireAgentId.trim()) return;
    setHireLoading(true);
    setHireResult("");
    try {
      const targetSvc = allServices.find((s: any) => String(s.agentId) === hireAgentId.trim());
      if (!targetSvc) { setHireResult(`Agent #${hireAgentId} not found.`); setHireLoading(false); return; }

      const res = await fetch(`${API}/v1/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: agent.agentWallet,
          sellerAgentId: Number(targetSvc.agentId),
          offeringName: targetSvc.name,
          serviceId: targetSvc.serviceId,
          requirements: { task: `Job from Agent #${agent.agentNftId} (${agent.name})` },
          paymentToken: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
          amount: String(Math.round(parseFloat(targetSvc.pricePerCall) * 1e18)),
        }),
      });
      const d = await res.json();
      if (d.jobId) {
        setHireResult(`Job ${d.jobId.slice(0,8)}... created. Agent #${targetSvc.agentId} is confirming.`);
      } else {
        setHireResult(`Failed: ${d.error}`);
      }
    } catch (e: any) { setHireResult(`Error: ${e.message}`); }
    setHireLoading(false);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-[#F4C430] border-t-transparent rounded-full" />
    </div>
  );

  if (!agent) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-center px-4">
      <div>
        <div className="text-4xl mb-4">🔍</div>
        <h1 className="text-xl font-bold text-white mb-2">Agent Not Found</h1>
        <p className="text-[#A1A1A1] text-sm mb-6">This agent doesn't exist or hasn't been launched yet.</p>
        <Link href="/launch" className="px-6 py-3 rounded-xl gradient-btn font-medium">Launch an Agent</Link>
      </div>
    </div>
  );

  const totalBalance = Object.values(walletBalance).reduce((s, v) => s + parseFloat(v||"0"), 0);
  const pendingJobs = jobs.filter(j => ["OPEN","NEGOTIATION","IN_PROGRESS"].includes(j.phase));
  const completedJobs = jobs.filter(j => j.phase === "COMPLETED");

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview",  label: "Overview" },
    { key: "offerings", label: "Offerings", badge: services.length },
    { key: "jobs",      label: "Jobs", badge: jobs.length },
    { key: "hire",      label: "Hire Agent" },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Agent Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-2xl bg-[#F4C430]/10 border border-[#F4C430]/20 flex items-center justify-center text-xl font-bold text-[#F4C430] flex-shrink-0">
            {agent.avatar
              ? <img src={agent.avatar} alt="" className="w-full h-full rounded-2xl object-cover" />
              : agent.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold truncate">{agent.name}</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400">Active</span>
              {agent.agentNftId && <span className="text-xs text-[#A1A1A1]">#{agent.agentNftId}</span>}
            </div>
            <p className="text-[#A1A1A1] text-xs mt-1 line-clamp-2">{agent.description}</p>
          </div>
          <Link href="/browse" className="text-[#A1A1A1] text-xs hover:text-white hidden sm:block flex-shrink-0">← Back</Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {[
            { label: "TrustScore", value: reputation.score, color: "text-[#F4C430]" },
            { label: "Jobs Done", value: completedJobs.length },
            { label: "Revenue",   value: `$${parseFloat(reputation.revenue).toFixed(2)}`, color: "text-[#F4C430]" },
            { label: "Balance",   value: `$${totalBalance.toFixed(2)}` },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[10px] text-[#A1A1A1] mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${s.color || ""}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Pending jobs alert */}
        {pendingJobs.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 text-xs font-medium">
                {pendingJobs.length} active job{pendingJobs.length > 1 ? "s" : ""} need attention
              </span>
            </div>
            <button onClick={() => setTab("jobs")} className="text-yellow-400 text-xs hover:underline">View →</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/10 mb-5 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                tab === t.key ? "border-[#F4C430] text-[#F4C430]" : "border-transparent text-[#A1A1A1] hover:text-white"
              }`}>
              {t.label}
              {t.badge !== undefined && <span className="ml-1 text-[10px] opacity-50">({t.badge})</span>}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="text-xs uppercase tracking-wider text-[#A1A1A1] mb-3">Identity</h3>
              <div className="space-y-2.5 text-sm">
                <div>
                  <div className="text-[10px] text-[#A1A1A1] mb-0.5">Agent Wallet</div>
                  <code className="text-[#F4C430] font-mono text-xs break-all">{agent.agentWallet}</code>
                </div>
                <div>
                  <div className="text-[10px] text-[#A1A1A1] mb-0.5">ERC-8004 Token ID</div>
                  <span className="font-mono">#{agent.agentNftId ?? "pending"}</span>
                </div>
                <div>
                  <div className="text-[10px] text-[#A1A1A1] mb-0.5">Owner</div>
                  <code className="text-[#A1A1A1] font-mono text-xs break-all">{agent.ownerAddress}</code>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="text-xs uppercase tracking-wider text-[#A1A1A1] mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <Link href={`/agents/${agent.agentNftId || agentId}`}
                  className="block w-full py-2 rounded-lg bg-[#F4C430]/10 text-[#F4C430] text-xs text-center hover:bg-[#F4C430]/20 transition">
                  View Public Profile
                </Link>
                <button onClick={() => setTab("jobs")}
                  className="block w-full py-2 rounded-lg bg-white/5 text-white text-xs text-center hover:bg-white/10 transition">
                  View All Jobs ({jobs.length})
                </button>
                <button onClick={() => setTab("hire")}
                  className="block w-full py-2 rounded-lg bg-white/5 text-white text-xs text-center hover:bg-white/10 transition">
                  Hire Another Agent
                </button>
              </div>
            </div>

            {/* Wallet breakdown */}
            {totalBalance > 0 && (
              <div className="sm:col-span-2 p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="text-xs uppercase tracking-wider text-[#A1A1A1] mb-2">Wallet Balances</h3>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(walletBalance).map(([token, amount]) => parseFloat(amount) > 0 && (
                    <div key={token} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs">
                      <span className="text-[#A1A1A1]">{token}:</span> <span className="font-medium">{parseFloat(amount).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OFFERINGS ── */}
        {tab === "offerings" && (
          <div className="space-y-2">
            {services.length === 0 ? (
              <div className="text-center py-10 text-[#A1A1A1]">
                <div className="text-3xl mb-2">📦</div>
                <p className="text-sm">No services registered on-chain yet.</p>
              </div>
            ) : services.map((s) => (
              <div key={s.serviceId} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm truncate">{s.name}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-[#A1A1A1] text-xs mt-0.5 line-clamp-1">{s.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[#F4C430] font-bold text-sm">${parseFloat(s.pricePerCall).toFixed(2)}</div>
                  <div className="text-[#A1A1A1] text-[10px]">USD</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── JOBS ── */}
        {tab === "jobs" && (
          <div>
            {/* Filter chips */}
            {jobs.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {["ALL","OPEN","NEGOTIATION","IN_PROGRESS","COMPLETED"].map(f => {
                  const count = f === "ALL" ? jobs.length : jobs.filter(j => j.phase === f).length;
                  if (f !== "ALL" && count === 0) return null;
                  return (
                    <span key={f} className={`px-2.5 py-1 rounded-full text-xs border flex-shrink-0 ${
                      count > 0 ? `${PHASE_COLOR[f] || "text-[#A1A1A1] border-white/10"} border-current/30` : "text-[#A1A1A1]/30 border-white/5"
                    }`}>
                      {PHASE_LABEL[f] || f} ({count})
                    </span>
                  );
                })}
              </div>
            )}

            {jobs.length === 0 ? (
              <div className="text-center py-10 text-[#A1A1A1]">
                <div className="text-3xl mb-2">📋</div>
                <p className="text-sm">No jobs yet for this agent.</p>
                <p className="text-xs mt-1 text-[#A1A1A1]/50">Jobs appear here when buyers hire this agent.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map(j => (
                  <JobCard
                    key={j.id}
                    job={j}
                    agentNftId={agent.agentNftId!}
                    ownerAddress={ownerAddress}
                    onRefresh={() => refreshJobs(agent)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HIRE AGENT (A2A) ── */}
        {tab === "hire" && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-semibold text-sm mb-1">Agent-to-Agent Hiring</h3>
            <p className="text-[#A1A1A1] text-xs mb-4">
              <span className="text-white font-medium">{agent.name}</span> can hire other agents using its own wallet.
              Payment goes through on-chain escrow — same as human buyers.
            </p>

            {/* Wallet balance */}
            <div className="mb-4 p-3 rounded-lg bg-[#F4C430]/5 border border-[#F4C430]/20 text-xs">
              <div className="text-[#F4C430] font-medium mb-1">Agent Wallet</div>
              <code className="text-[#A1A1A1] text-[10px]">{agent.agentWallet}</code>
              <div className="mt-1">
                {Object.entries(walletBalance).length > 0
                  ? Object.entries(walletBalance).map(([t, v]) => (
                    <div key={t} className="text-[#A1A1A1]">{t}: <span className="text-white">{parseFloat(v).toFixed(4)}</span></div>
                  ))
                  : <div className="text-[#A1A1A1]/50">No balance. Deposit stablecoins to start hiring.</div>
                }
              </div>
            </div>

            {/* Available agents */}
            <div className="mb-4">
              <div className="text-xs text-[#A1A1A1] mb-2">Available Agents</div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {allServices.map((s: any) => (
                  <button key={s.serviceId} onClick={() => setHireAgentId(String(s.agentId))}
                    className={`w-full p-2.5 rounded-lg border text-left text-xs transition ${
                      hireAgentId === String(s.agentId)
                        ? "border-[#F4C430]/50 bg-[#F4C430]/5"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/5"
                    }`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{s.name} <span className="text-[#A1A1A1] font-normal">#{s.agentId}</span></span>
                      <span className="text-[#F4C430]">${parseFloat(s.pricePerCall).toFixed(2)}</span>
                    </div>
                    <p className="text-[#A1A1A1] text-[10px] mt-0.5 line-clamp-1">{s.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleA2AHire} disabled={hireLoading || !hireAgentId}
              className="w-full py-2.5 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm disabled:opacity-30 transition">
              {hireLoading ? "Hiring..." : hireAgentId ? `Hire Agent #${hireAgentId}` : "Select an agent above"}
            </button>

            {hireResult && (
              <div className={`mt-3 p-3 rounded-lg text-xs ${hireResult.includes("Job") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {hireResult}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[#A1A1A1]/40 text-[10px]">Manage via chat: /name /desc /price /tags /info</p>
        </div>
      </div>
    </div>
  );
}
