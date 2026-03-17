"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

interface Job {
  id: string;
  buyer_address: string;
  seller_agent_id: number;
  offering_name: string;
  requirements: Record<string, any>;
  payment_token: string;
  amount: string;
  amount_usd: number;
  phase: string;
  deal_id?: number;
  deal_tx_hash?: string;
  deliverable?: string;
  delivery_proof?: string;
  memo_history: { phase: string; message: string; ts: number }[];
  payment_request?: { amount: string; token: string; usd_value: number; message: string };
  expires_at: string;
  created_at: string;
}

const PHASES = ["OPEN", "NEGOTIATION", "IN_PROGRESS", "COMPLETED"];
const PHASE_LABELS: Record<string, string> = {
  OPEN: "Pending",
  NEGOTIATION: "Payment Review",
  IN_PROGRESS: "Working",
  COMPLETED: "Delivered",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};
const PHASE_COLORS: Record<string, string> = {
  OPEN: "text-yellow-400 bg-yellow-400/10",
  NEGOTIATION: "text-blue-400 bg-blue-400/10",
  IN_PROGRESS: "text-purple-400 bg-purple-400/10",
  COMPLETED: "text-green-400 bg-green-400/10",
  REJECTED: "text-red-400 bg-red-400/10",
  EXPIRED: "text-gray-400 bg-gray-400/10",
};

function PhaseTimeline({ phase }: { phase: string }) {
  const currentIdx = PHASES.indexOf(phase);
  const isTerminal = ["REJECTED", "EXPIRED"].includes(phase);

  return (
    <div className="flex items-center gap-0 w-full mb-4">
      {PHASES.map((p, i) => {
        const done = !isTerminal && i <= currentIdx;
        const active = p === phase && !isTerminal;
        return (
          <div key={p} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition ${
                done ? "bg-[#F4C430] border-[#F4C430] text-[#0A0A0A]" :
                active ? "bg-[#F4C430]/20 border-[#F4C430] text-[#F4C430]" :
                "bg-transparent border-white/20 text-[#A1A1A1]"
              }`}>
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-[9px] mt-1 whitespace-nowrap ${done || active ? "text-[#F4C430]" : "text-[#A1A1A1]/40"}`}>
                {PHASE_LABELS[p] || p}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${done && i < currentIdx ? "bg-[#F4C430]" : "bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function JobsPage() {
  const { wallets } = useWallets();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [paying, setPaying] = useState<string | null>(null);

  const address = wallets?.[0]?.address;

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    loadJobs();
    const interval = setInterval(loadJobs, 8000); // Poll every 8s
    return () => clearInterval(interval);
  }, [address]);

  async function loadJobs() {
    if (!address) return;
    try {
      const res = await fetch(`${API}/v1/jobs?buyerAddress=${address}&limit=50`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {}
    setLoading(false);
  }

  async function approvePay(job: Job) {
    setPaying(job.id);
    try {
      const res = await fetch(`${API}/v1/jobs/${job.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true, ownerAddress: address }),
      });
      const data = await res.json();
      if (data.success) await loadJobs();
      else alert(data.error || "Payment failed");
    } catch (e: any) { alert(e.message); }
    setPaying(null);
  }

  async function rejectJob(jobId: string) {
    try {
      await fetch(`${API}/v1/jobs/${jobId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Buyer rejected", by: "buyer" }),
      });
      await loadJobs();
    } catch {}
  }

  const filtered = filter === "ALL" ? jobs : jobs.filter(j => j.phase === filter);

  if (!address) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-center px-4">
        <div>
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-white mb-2">Connect Wallet</h1>
          <p className="text-[#A1A1A1] text-sm">Connect your wallet to view your jobs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">My Jobs</h1>
            <p className="text-[#A1A1A1] text-sm mt-1">Track and manage your agent job orders</p>
          </div>
          <Link href="/browse" className="px-4 py-2 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm hover:opacity-90 transition">
            + Hire Agent
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto mb-6 border-b border-white/10">
          {["ALL", "OPEN", "NEGOTIATION", "IN_PROGRESS", "COMPLETED", "REJECTED"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition ${
                filter === f ? "border-[#F4C430] text-[#F4C430]" : "border-transparent text-[#A1A1A1] hover:text-white"
              }`}
            >
              {f === "ALL" ? "All" : PHASE_LABELS[f] || f}
              <span className="ml-1 opacity-40">({f === "ALL" ? jobs.length : jobs.filter(j => j.phase === f).length})</span>
            </button>
          ))}
        </div>

        {/* Job list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-[#F4C430] border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-[#A1A1A1]">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">No jobs yet. Hire an agent to get started.</p>
            <Link href="/browse" className="mt-4 inline-block px-6 py-2 rounded-xl bg-[#F4C430]/10 text-[#F4C430] text-sm border border-[#F4C430]/20 hover:bg-[#F4C430]/20 transition">
              Browse Agents
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onPay={() => approvePay(job)}
                onReject={() => rejectJob(job.id)}
                paying={paying === job.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job, onPay, onReject, paying }: {
  job: Job; onPay: () => void; onReject: () => void; paying: boolean;
}) {
  const [open, setOpen] = useState(job.phase === "NEGOTIATION" || job.phase === "COMPLETED");

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="p-4 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_COLORS[job.phase] || "text-gray-400 bg-gray-400/10"}`}>
                {PHASE_LABELS[job.phase] || job.phase}
              </span>
              <span className="text-xs text-[#A1A1A1]">Agent #{job.seller_agent_id}</span>
              {job.deal_id && <span className="text-xs text-[#A1A1A1]">Deal #{job.deal_id}</span>}
            </div>
            <h3 className="font-semibold text-sm truncate">{job.offering_name}</h3>
            {job.requirements?.task && (
              <p className="text-[#A1A1A1] text-xs mt-0.5 line-clamp-1">{job.requirements.task}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[#F4C430] font-bold text-sm">${job.amount_usd?.toFixed(2) || "?"}</div>
            <div className="text-[#A1A1A1] text-xs">{new Date(job.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Phase timeline (compact) */}
        <div className="mt-3">
          <PhaseTimeline phase={job.phase} />
        </div>
      </div>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-white/[0.06] p-4 space-y-3">

          {/* NEGOTIATION: buyer must approve payment */}
          {job.phase === "NEGOTIATION" && job.payment_request && (
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <div className="text-blue-400 font-semibold text-xs mb-1">Payment Request</div>
              <p className="text-sm text-white mb-1">{job.payment_request.message}</p>
              <p className="text-[#A1A1A1] text-xs mb-3">
                Amount: <span className="text-[#F4C430] font-medium">${job.amount_usd?.toFixed(2)} USD</span> — funds locked in on-chain escrow
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onPay}
                  disabled={paying}
                  className="flex-1 py-2.5 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm disabled:opacity-50 hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition"
                >
                  {paying ? "Approving..." : `Approve & Pay $${job.amount_usd?.toFixed(2)}`}
                </button>
                <button
                  onClick={onReject}
                  className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* IN_PROGRESS: spinner */}
          {job.phase === "IN_PROGRESS" && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
              <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div>
                <div className="text-purple-400 font-semibold text-xs">Agent Working</div>
                <div className="text-[#A1A1A1] text-xs">Payment is locked in escrow. Agent is executing your task...</div>
              </div>
            </div>
          )}

          {/* COMPLETED: deliverable */}
          {job.phase === "COMPLETED" && job.deliverable && (
            <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
              <div className="text-green-400 font-semibold text-xs mb-2">Deliverable</div>
              <div className="text-sm text-[#F5F5F5] whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {job.deliverable}
              </div>
              {job.delivery_proof && (
                <div className="mt-2 text-[#A1A1A1]/50 text-[10px]">{job.delivery_proof}</div>
              )}
              {job.deal_tx_hash && (
                <a href={`https://celoscan.io/tx/${job.deal_tx_hash}`} target="_blank" className="block mt-2 text-xs text-[#F4C430] hover:underline">
                  View escrow TX on CeloScan →
                </a>
              )}
            </div>
          )}

          {/* Activity log */}
          {job.memo_history?.length > 0 && (
            <div>
              <div className="text-[#A1A1A1]/50 text-xs mb-2">Activity</div>
              <div className="space-y-1.5">
                {job.memo_history.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-[#A1A1A1]/40 flex-shrink-0">{new Date(m.ts).toLocaleTimeString()}</span>
                    <span className={`flex-shrink-0 ${PHASE_COLORS[m.phase] || ""} px-1.5 py-0.5 rounded text-[10px]`}>{m.phase}</span>
                    <span className="text-[#A1A1A1]">{m.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
