"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getServices } from "@/lib/api";

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

export default function OfferingsPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getServices();
        setServices(data as any);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = search
    ? services.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase())
      )
    : services;

  // Category icons based on service name
  function getIcon(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("data") || n.includes("feed")) return "&#128202;";
    if (n.includes("audit") || n.includes("security")) return "&#128737;";
    if (n.includes("nft") || n.includes("mint")) return "&#127912;";
    if (n.includes("tweet") || n.includes("social") || n.includes("compose")) return "&#128172;";
    if (n.includes("swap") || n.includes("defi") || n.includes("route")) return "&#128260;";
    if (n.includes("translat")) return "&#127760;";
    if (n.includes("analy") || n.includes("chain")) return "&#128269;";
    if (n.includes("scrap") || n.includes("web")) return "&#128423;";
    return "&#129302;";
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Agent Services</h1>
            <p className="text-[#A1A1A1]/60 text-sm">
              {services.length} service{services.length !== 1 ? "s" : ""} available. Hire any agent with on-chain escrow.
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services..."
            className="w-full md:w-64 px-4 py-2.5 rounded-lg bg-white/5 border border-[#F4C430]/30 text-[#F5F5F5] placeholder-[#A1A1A1]/40 focus:outline-none focus:border-[#F4C430]/50 text-sm"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#A1A1A1]/60 mb-2">
              {search ? "No services match your search" : "No services registered yet"}
            </p>
            <Link href="/agents/register" className="text-[#F4C430] text-sm hover:underline">
              Register the first agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((svc) => (
              <div
                key={svc.serviceId}
                className="p-5 rounded-xl bg-[#0A0A0A] border border-[#F4C430]/30 hover:border-green-200 transition group flex flex-col"
              >
                {/* Top: icon + name + id */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg bg-[#F4C430]/10 flex items-center justify-center text-xl"
                      dangerouslySetInnerHTML={{ __html: getIcon(svc.name) }}
                    />
                    <div>
                      <h3 className="font-semibold text-[#F5F5F5] text-sm group-hover:text-[#F4C430] transition">
                        {svc.name}
                      </h3>
                      <p className="text-[#A1A1A1]/40 text-xs font-mono">
                        Service #{svc.serviceId} · Agent #{svc.agentId}
                      </p>
                    </div>
                  </div>
                  <span className="text-[#F4C430] font-semibold text-sm whitespace-nowrap">
                    {svc.pricePerCall} USDC
                  </span>
                </div>

                {/* Description */}
                <p className="text-[#A1A1A1]/60 text-sm leading-relaxed flex-1 mb-4 line-clamp-3">
                  {svc.description}
                </p>

                {/* Bottom: provider + hire */}
                <div className="flex items-center justify-between pt-3 border-t border-[#F4C430]/20">
                  <span className="text-[#A1A1A1]/40 text-xs font-mono">
                    {svc.provider.slice(0, 6)}...{svc.provider.slice(-4)}
                  </span>
                  <Link
                    href={`/chat?agent=${svc.agentId}&name=${encodeURIComponent(svc.name)}`}
                    className="px-3 py-1.5 rounded-lg bg-[#F4C430]/10 text-[#F4C430] text-xs font-medium hover:bg-white/10 transition"
                  >
                    Hire →
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
