"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createPublicClient, http, formatUnits } from "viem";
import { celoSepoliaCustom, CONTRACTS, ESCROW_ABI } from "@/lib/contracts";

const client = createPublicClient({ chain: celoSepoliaCustom, transport: http() });
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

interface UserProfile {
  bio: string;
  displayName: string;
  avatar: string;
  socials: Record<string, { platform: string; username: string; url: string; avatar?: string; followers?: number }>;
}

const TIER_COLORS: Record<string, string> = {
  Diamond: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
  Gold: "text-[#F4C430] bg-[#F4C430]/10 border-[#F4C430]/30",
  Silver: "text-slate-300 bg-slate-300/10 border-slate-300/30",
  Bronze: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  New: "text-[#A1A1A1] bg-white/5 border-white/10",
};

const DEAL_STATUS: Record<number, string> = {
  0: "Created", 1: "Accepted", 2: "Delivered", 3: "Completed",
  4: "Disputed", 5: "Refunded", 6: "Expired", 7: "Resolved"
};

export default function PublicProfilePage() {
  const params = useParams();
  const rawAddress = (params?.address as string) || "";
  const address = rawAddress.toLowerCase();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reputation, setReputation] = useState<any>(null);
  const [recentDeals, setRecentDeals] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const isValid = /^0x[0-9a-f]{40}$/.test(address);

  useEffect(() => {
    if (!isValid) { setLoading(false); return; }

    // Load profile from localStorage (user-editable)
    try {
      const stored = localStorage.getItem(`nastar-profile-${address}`);
      if (stored) setProfile(JSON.parse(stored));
      else setProfile({ bio: "", displayName: "", avatar: "", socials: {} });
    } catch {
      setProfile({ bio: "", displayName: "", avatar: "", socials: {} });
    }

    // Load on-chain data in parallel
    Promise.all([
      fetchReputation(),
      fetchDeals(),
      fetchServices(),
    ]).finally(() => setLoading(false));
  }, [address]);

  async function fetchReputation() {
    try {
      const res = await fetch(`${API_URL}/v1/reputation/0/score?address=${address}`);
      if (res.ok) setReputation(await res.json());
    } catch {}
  }

  async function fetchDeals() {
    try {
      const nextId = await client.readContract({
        address: CONTRACTS.NASTAR_ESCROW, abi: ESCROW_ABI, functionName: "nextDealId"
      }) as bigint;

      const found: any[] = [];
      const limit = nextId > 50n ? nextId - 50n : 0n; // last 50 deals only
      for (let i = nextId - 1n; i >= limit && found.length < 10; i--) {
        try {
          const deal = await client.readContract({
            address: CONTRACTS.NASTAR_ESCROW, abi: ESCROW_ABI, functionName: "getDeal", args: [i]
          }) as any;
          if (deal.buyer.toLowerCase() === address || deal.seller.toLowerCase() === address) {
            found.push(deal);
          }
        } catch {}
      }
      setRecentDeals(found);
    } catch {}
  }

  async function fetchServices() {
    try {
      const res = await fetch(`${API_URL}/services?provider=${address}&limit=6`);
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || data || []);
      }
    } catch {}
  }

  if (!isValid) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#A1A1A1] text-sm">Invalid address</p>
          <Link href="/" className="text-[#F4C430] text-sm mt-2 block">Go home</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="space-y-3 w-full max-w-2xl mx-auto px-4">
          <div className="h-32 rounded-2xl bg-white/[0.03] animate-pulse" />
          <div className="h-48 rounded-2xl bg-white/[0.03] animate-pulse" />
          <div className="h-32 rounded-2xl bg-white/[0.03] animate-pulse" />
        </div>
      </div>
    );
  }

  const displayName = profile?.displayName || shortAddr;
  const tier = reputation?.tier || "New";
  const score = reputation?.score ?? null;
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.New;
  const hasAvatar = !!profile?.avatar;
  const hasBio = !!(profile?.bio?.trim());
  const hasSocials = profile?.socials && Object.keys(profile.socials).length > 0;

  const completedDeals = recentDeals.filter(d => d.status === 3n || d.status === 3).length;
  const asSellerDeals = recentDeals.filter(d => d.seller.toLowerCase() === address);
  const asBuyerDeals = recentDeals.filter(d => d.buyer.toLowerCase() === address);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-2xl mx-auto px-4 py-12">

        {/* Profile card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 mb-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {hasAvatar ? (
                <img src={profile!.avatar} alt={displayName} className="w-20 h-20 rounded-full object-cover border-2 border-[#F4C430]/20" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#F4C430] text-[#0A0A0A] text-2xl font-bold flex items-center justify-center">
                  {address.slice(2, 4).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-[#F5F5F5] truncate">{displayName}</h1>
                {score !== null && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tierColor}`}>
                    {tier} · {typeof score === 'number' ? score.toFixed(0) : score}
                  </span>
                )}
              </div>

              <button
                onClick={() => { navigator.clipboard.writeText(rawAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-1.5 text-[#A1A1A1]/50 font-mono text-xs mt-1 hover:text-[#F4C430] transition"
              >
                {shortAddr}
                {copied ? <span className="text-[#F4C430]">Copied!</span> : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>

              {hasBio && <p className="text-[#A1A1A1] text-sm mt-2 leading-relaxed">{profile!.bio}</p>}

              {/* Socials */}
              {hasSocials && (
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  {Object.values(profile!.socials).map((s) => (
                    <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[#A1A1A1] hover:text-[#F4C430] text-xs transition">
                      {s.platform === "GitHub" && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                      )}
                      {s.platform === "Twitter" && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      )}
                      {s.platform === "Telegram" && (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                      )}
                      <span>@{s.username}</span>
                    </a>
                  ))}
                  <a href={`https://sepolia.celoscan.io/address/${rawAddress}`} target="_blank"
                    className="flex items-center gap-1 text-[#A1A1A1]/40 hover:text-[#F4C430] text-xs transition">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                    CeloScan
                  </a>
                </div>
              )}

              {!hasSocials && (
                <div className="flex items-center gap-2 mt-3">
                  <a href={`https://sepolia.celoscan.io/address/${rawAddress}`} target="_blank"
                    className="flex items-center gap-1 text-[#A1A1A1]/40 hover:text-[#F4C430] text-xs transition">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                    View on CeloScan
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        {reputation && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "TrustScore", value: typeof reputation.score === 'number' ? reputation.score.toFixed(0) : "—" },
              { label: "Deals Done", value: reputation.totalDeals ?? completedDeals ?? "—" },
              { label: "Success Rate", value: reputation.completionRate != null ? `${(reputation.completionRate * 100).toFixed(0)}%` : "—" },
              { label: "Volume", value: reputation.volumeUsdc != null ? `$${Number(reputation.volumeUsdc).toFixed(0)}` : "—" },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
                <div className="text-lg font-bold text-[#F5F5F5]">{s.value}</div>
                <div className="text-[#A1A1A1]/50 text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Services */}
        {services.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-[#A1A1A1]/50 uppercase tracking-wider mb-3">Services Offered</h2>
            <div className="space-y-2">
              {services.map((svc: any, i: number) => (
                <Link key={i} href={`/hire/${svc.serviceId ?? svc.id ?? i}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/30 transition group">
                  <div>
                    <p className="text-[#F5F5F5] text-sm font-medium group-hover:text-[#F4C430] transition">{svc.name}</p>
                    {svc.description && <p className="text-[#A1A1A1]/40 text-xs truncate max-w-xs">{svc.description}</p>}
                  </div>
                  <span className="text-[#F4C430] text-xs font-mono flex-shrink-0 ml-3">
                    {svc.pricePerCall ? `${formatUnits(BigInt(svc.pricePerCall), 6)} USDC` : "—"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent deals */}
        {recentDeals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-[#A1A1A1]/50 uppercase tracking-wider mb-3">
              Recent Activity <span className="text-[#A1A1A1]/20 font-normal normal-case">({recentDeals.length} deal{recentDeals.length > 1 ? "s" : ""})</span>
            </h2>
            <div className="space-y-2">
              {recentDeals.map((deal: any) => {
                const isSeller = deal.seller.toLowerCase() === address;
                const status = DEAL_STATUS[Number(deal.status)] || "Unknown";
                const amount = formatUnits(deal.amount, 6);
                return (
                  <div key={deal.dealId.toString()} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        status === "Completed" ? "bg-green-400" :
                        status === "Disputed" ? "bg-red-400" :
                        status === "Resolved" ? "bg-purple-400" :
                        "bg-[#A1A1A1]/30"
                      }`} />
                      <div>
                        <p className="text-[#F5F5F5] text-xs font-mono">#{deal.dealId.toString()}</p>
                        <p className="text-[#A1A1A1]/40 text-[10px]">{isSeller ? "Sold" : "Bought"} · {status}</p>
                      </div>
                    </div>
                    <span className="text-[#F4C430] text-xs font-mono">{amount} USDC</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state — no data at all */}
        {!reputation && services.length === 0 && recentDeals.length === 0 && (
          <div className="text-center py-12 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-[#A1A1A1]/40 text-sm">No on-chain activity yet for this address.</p>
            <Link href="/launch" className="mt-4 inline-block px-5 py-2 rounded-lg gradient-btn text-sm font-bold">
              Launch an Agent
            </Link>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-[#A1A1A1]/30 text-xs hover:text-[#A1A1A1] transition">
            Back to Nastar
          </Link>
        </div>
      </div>
    </div>
  );
}
