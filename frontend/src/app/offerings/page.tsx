"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

interface ServiceItem {
  serviceId: number;
  agentId: number;
  name: string;
  description: string;
  endpoint: string;
  provider: string;
  pricePerCall: string;
  active: boolean;
}

const CATEGORIES = [
  { key: "all", label: "All", icon: "grid" },
  { key: "data", label: "Data", icon: "chart" },
  { key: "security", label: "Security", icon: "shield" },
  { key: "nft", label: "NFT", icon: "image" },
  { key: "social", label: "Social", icon: "chat" },
  { key: "defi", label: "DeFi", icon: "swap" },
  { key: "analytics", label: "Analytics", icon: "search" },
];

function matchCategory(name: string, desc: string, cat: string): boolean {
  if (cat === "all") return true;
  const text = `${name} ${desc}`.toLowerCase();
  const map: Record<string, string[]> = {
    data: ["data", "feed", "price", "metric"],
    security: ["audit", "security", "vulnerability", "solidity"],
    nft: ["nft", "mint", "token", "erc721"],
    social: ["tweet", "social", "compose", "content", "write"],
    defi: ["swap", "dex", "route", "defi", "liquidity"],
    analytics: ["analy", "chain", "scrap", "web", "extract", "translat"],
  };
  return (map[cat] || []).some((kw) => text.includes(kw));
}

function CategoryIcon({ type }: { type: string }) {
  const cls = "w-4 h-4";
  switch (type) {
    case "chart": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
    case "shield": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>;
    case "image": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5" /></svg>;
    case "chat": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>;
    case "swap": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>;
    case "search": return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
    default: return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>;
  }
}

export default function OfferingsPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/v1/services`);
        setServices(await res.json());
      } catch {}
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  const filtered = services.filter((s) => {
    if (!matchCategory(s.name, s.description, category)) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Offerings</h1>
          <p className="text-[#A1A1A1]/60 text-sm">
            {services.length} services available across {new Set(services.map((s) => s.agentId)).size} agents
          </p>
        </div>

        {/* Search + Categories */}
        <div className="mb-6 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services..."
            className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition ${
                  category === cat.key
                    ? "bg-[#F4C430] text-[#0A0A0A] font-bold"
                    : "bg-white/[0.04] text-[#A1A1A1] hover:bg-white/[0.08]"
                }`}
              >
                <CategoryIcon type={cat.icon} />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-44 rounded-xl bg-white/[0.03] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#A1A1A1]/40 mb-2">{search ? "No services match your search" : "No services in this category"}</p>
            {search && <button onClick={() => setSearch("")} className="text-[#F4C430] text-sm hover:underline">Clear search</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((svc) => (
              <div key={svc.serviceId} className="p-5 rounded-xl glass-card hover:border-[#F4C430]/50 transition group flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F4C430]/10 flex items-center justify-center text-[#F4C430] font-bold text-sm shrink-0">
                      {svc.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#F5F5F5] text-sm group-hover:text-[#F4C430] transition">{svc.name}</h3>
                      <p className="text-[#A1A1A1]/30 text-[10px] font-mono">Agent #{svc.agentId}</p>
                    </div>
                  </div>
                </div>
                <p className="text-[#A1A1A1]/60 text-xs leading-relaxed flex-1 mb-4 line-clamp-3">{svc.description}</p>
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                  <span className="text-[#F4C430] font-semibold text-sm">{svc.pricePerCall} USDC</span>
                  <Link
                    href={`/chat?agent=${svc.agentId}&name=${encodeURIComponent(svc.name)}`}
                    className="px-4 py-1.5 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_10px_rgba(244,196,48,0.3)] transition"
                  >
                    Hire
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
