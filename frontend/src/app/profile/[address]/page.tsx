"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatUnits } from "viem";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

const TIER_COLORS: Record<string, { badge: string; glow: string }> = {
  Diamond: { badge: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30", glow: "shadow-[0_0_20px_rgba(34,211,238,0.2)]" },
  Gold: { badge: "text-[#F4C430] bg-[#F4C430]/10 border-[#F4C430]/30", glow: "shadow-[0_0_20px_rgba(244,196,48,0.2)]" },
  Silver: { badge: "text-slate-300 bg-slate-300/10 border-slate-300/30", glow: "" },
  Bronze: { badge: "text-orange-400 bg-orange-400/10 border-orange-400/30", glow: "" },
  New: { badge: "text-[#A1A1A1] bg-white/5 border-white/10", glow: "" },
};

const STATUS_DOT: Record<string, string> = {
  Completed: "bg-green-400", Disputed: "bg-red-400", Resolved: "bg-[#F4C430]",
  Accepted: "bg-yellow-400", Delivered: "bg-purple-400", Created: "bg-blue-400",
};

function getServiceIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("research") || n.includes("web")) return "🔍";
  if (n.includes("translat") || n.includes("language")) return "🌐";
  if (n.includes("code") || n.includes("solidity") || n.includes("review")) return "🛡️";
  if (n.includes("data") || n.includes("analy")) return "📊";
  if (n.includes("trade") || n.includes("swap")) return "⚡";
  if (n.includes("social") || n.includes("tweet")) return "💬";
  return "🤖";
}

export default function PublicProfilePage() {
  const params = useParams();
  const rawAddress = (params?.address as string) || "";
  const address = rawAddress.toLowerCase();

  const [services, setServices] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [reputation, setReputation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showErc8004, setShowErc8004] = useState(false);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const isValid = /^0x[0-9a-f]{40}$/i.test(address);

  useEffect(() => {
    if (!isValid) { setLoading(false); return; }

    async function loadAll() {
      // Load all services, filter by provider address
      try {
        const res = await fetch(`${API_URL}/services`);
        if (res.ok) {
          const data = await res.json();
          const all = data.services || data || [];
          setServices(all.filter((s: any) => s.provider?.toLowerCase() === address));
        }
      } catch {}

      // Load all deals, filter by buyer/seller
      try {
        const res = await fetch(`${API_URL}/deals?limit=50`);
        if (res.ok) {
          const data = await res.json();
          const all = data.deals || [];
          setDeals(all.filter((d: any) =>
            d.buyer?.toLowerCase() === address || d.seller?.toLowerCase() === address
          ));
        }
      } catch {}

      // Load reputation for all agents, find one matching this address
      try {
        const res = await fetch(`${API_URL}/v1/reputation/leaderboard`);
        if (res.ok) {
          const lb = await res.json();
          const match = lb.find((a: any) => a.address?.toLowerCase() === address);
          if (match) {
            setReputation(match);
          }
        }
      } catch {}

      setLoading(false);
    }
    loadAll();
  }, [address, isValid]);

  if (!isValid) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="text-[#A1A1A1] text-sm">Invalid address</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="space-y-3 w-full max-w-2xl mx-auto px-4">
          <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" />
          <div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />
          <div className="h-48 rounded-2xl bg-white/[0.03] animate-pulse" />
        </div>
      </div>
    );
  }

  const agentName = services.length > 0 ? services[0].name : shortAddr;
  const agentDesc = services.length > 0 ? services.map((s: any) => s.description).join(" | ") : "";
  const tier = reputation?.tier || "New";
  const score = reputation?.score ?? 0;
  const tierStyle = TIER_COLORS[tier] || TIER_COLORS.New;

  const completedDeals = deals.filter((d: any) => [3, 7].includes(Number(d.status))).length;
  const totalDeals = deals.length;
  const successRate = totalDeals > 0 ? Math.round((completedDeals / totalDeals) * 100) : 0;

  // Calculate volume
  let volume = 0;
  for (const d of deals) {
    if ([3, 7].includes(Number(d.status))) {
      try { volume += parseFloat(formatUnits(BigInt(d.amount), 18)); } catch {}
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Back */}
        <Link href="/offerings" className="inline-flex items-center gap-1.5 text-[#A1A1A1]/50 text-sm hover:text-[#F5F5F5] transition mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back
        </Link>

        {/* ── Main Profile Card ────────────────────────────────── */}
        <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 mb-6 ${tierStyle.glow}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#F4C430]/30 to-[#FF9F1C]/10 flex items-center justify-center text-2xl shrink-0">
                {services.length > 0 ? getServiceIcon(services[0].name) : "🤖"}
              </div>

              <div className="flex-1 min-w-0">
                {/* Name + Badge */}
                <div className="flex items-center gap-2.5 flex-wrap mb-1">
                  <h1 className="text-xl font-bold truncate">{agentName}</h1>
                  {score > 0 && (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tierStyle.badge}`}>
                      {tier} · {score}
                    </span>
                  )}
                </div>

                {/* Address + Copy */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(rawAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="flex items-center gap-1.5 text-[#A1A1A1]/50 font-mono text-xs hover:text-[#F4C430] transition"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
                    </svg>
                    {shortAddr}
                    {copied && <span className="text-[#F4C430] text-[10px]">Copied!</span>}
                  </button>
                </div>

                {/* ERC-8004 Badge + Links (Virtuals-style: click to toggle) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowErc8004(!showErc8004)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                      showErc8004
                        ? "bg-[#F4C430]/20 border-[#F4C430]/40 text-[#F4C430]"
                        : "bg-[#F4C430]/10 border-[#F4C430]/20 text-[#F4C430] hover:bg-[#F4C430]/20"
                    }`}
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    ERC-8004
                  </button>

                  {showErc8004 && (
                    <>
                      <a
                        href={`https://sepolia.celoscan.io/address/${rawAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1A1A1A] border border-[#F4C430]/30 text-[#F4C430] text-xs font-medium hover:bg-[#F4C430]/10 transition"
                      >
                        View Tx
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                      <a
                        href={`https://agentscan.info/agents/${rawAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1A1A1A] border border-[#F4C430]/30 text-[#F4C430] text-xs font-medium hover:bg-[#F4C430]/10 transition"
                      >
                        8004scan
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    </>
                  )}
                </div>

                {/* Description */}
                {agentDesc && (
                  <p className="text-[#A1A1A1]/60 text-sm mt-3 leading-relaxed">{agentDesc}</p>
                )}
              </div>
            </div>

            {/* Hire button */}
            {services.length > 0 && (
              <Link
                href={`/chat?agent=${services[0].agentId}&name=${encodeURIComponent(services[0].name)}`}
                className="px-5 py-2 rounded-xl bg-[#F4C430] text-[#0A0A0A] text-sm font-bold hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition shrink-0"
              >
                Hire
              </Link>
            )}
          </div>
        </div>

        {/* ── Stats Row ───────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "TrustScore", value: score > 0 ? String(score) : "—" },
            { label: "Deals Done", value: totalDeals > 0 ? String(totalDeals) : "—" },
            { label: "Success Rate", value: totalDeals > 0 ? `${successRate}%` : "—" },
            { label: "Volume", value: volume > 0 ? `$${volume.toFixed(0)}` : "—" },
          ].map((s) => (
            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
              <div className="text-lg font-bold text-[#F5F5F5]">{s.value}</div>
              <div className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Services ────────────────────────────────────────── */}
        {services.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mb-3">Services Offered</h2>
            <div className="space-y-2">
              {services.map((svc: any, i: number) => {
                let price = "—";
                try { price = `${parseFloat(formatUnits(BigInt(svc.pricePerCall), 18)).toFixed(0)} USDC`; } catch {}
                return (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/20 transition">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-lg">{getServiceIcon(svc.name)}</span>
                      <div className="min-w-0">
                        <p className="text-[#F5F5F5] text-sm font-medium">{svc.name}</p>
                        <p className="text-[#A1A1A1]/40 text-xs truncate">{svc.description}</p>
                      </div>
                    </div>
                    <span className="text-[#F4C430] text-sm font-semibold ml-3 shrink-0">{price}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recent Activity ─────────────────────────────────── */}
        {deals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mb-3">
              Recent Activity ({deals.length} deals)
            </h2>
            <div className="space-y-1.5">
              {deals.slice(0, 10).map((deal: any) => {
                const isSeller = deal.seller?.toLowerCase() === address;
                const status = deal.statusLabel || "Unknown";
                let amount = "—";
                try { amount = `${parseFloat(formatUnits(BigInt(deal.amount), 18)).toFixed(0)} USDC`; } catch {}
                return (
                  <div key={deal.dealId} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] || "bg-[#A1A1A1]/30"}`} />
                      <div>
                        <p className="text-[#F5F5F5] text-xs font-mono">#{deal.dealId}</p>
                        <p className="text-[#A1A1A1]/40 text-[10px]">{isSeller ? "Sold" : "Bought"} · {status}</p>
                      </div>
                    </div>
                    <span className="text-[#F4C430] text-xs font-mono">{amount}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty */}
        {services.length === 0 && deals.length === 0 && (
          <div className="text-center py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-[#A1A1A1]/40 text-sm mb-4">No on-chain activity yet for this address.</p>
            <Link href="/launch" className="px-5 py-2 rounded-lg gradient-btn text-sm font-bold">
              Launch an Agent
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
