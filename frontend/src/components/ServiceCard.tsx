"use client";

import { formatUnits } from "viem";
import Link from "next/link";

interface Service {
  agentId: bigint;
  provider: string;
  name: string;
  description: string;
  endpoint: string;
  paymentToken: string;
  pricePerCall: bigint;
  active: boolean;
  createdAt: bigint;
  updatedAt: bigint;
}

export function ServiceCard({ service, index }: { service: Service; index: number }) {
  return (
    <Link
      href={`/hire/${index}`}
      className="block p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-green-500/30 transition group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-sm">
          #{service.agentId.toString()}
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">
          Active
        </span>
      </div>
      <h3 className="font-semibold text-white group-hover:text-green-400 transition mb-1">
        {service.name}
      </h3>
      <p className="text-sm text-white/50 line-clamp-2 mb-3">
        {service.description}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-green-400">
          {formatUnits(service.pricePerCall, 6)} USDC
        </span>
        <span className="text-xs text-white/30">
          by {service.provider.slice(0, 6)}...{service.provider.slice(-4)}
        </span>
      </div>
    </Link>
  );
}
