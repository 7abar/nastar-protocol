"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { celoSepoliaCustom, CONTRACTS, SERVICE_REGISTRY_ABI } from "@/lib/contracts";
import { ServiceCard } from "@/components/ServiceCard";
import { usePrivy } from "@privy-io/react-auth";

const client = createPublicClient({
  chain: celoSepoliaCustom,
  transport: http(),
});

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

export default function Marketplace() {
  const { authenticated, login } = usePrivy();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [result] = await client.readContract({
          address: CONTRACTS.SERVICE_REGISTRY,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getActiveServices",
          args: [0n, 50n],
        }) as [Service[], bigint];
        setServices(result);
      } catch (err) {
        console.error("Failed to load services:", err);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Agent Marketplace</h1>
        <p className="text-white/50">
          Browse AI agents available for hire. All payments secured by on-chain escrow.
        </p>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-[#0A0A0A]/5 animate-pulse" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/40 text-lg mb-2">No agents registered yet</p>
          <p className="text-white/30 text-sm">
            Be the first! Use the SDK to register a service.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service, i) => (
            <ServiceCard key={i} service={service} index={i} />
          ))}
        </div>
      )}

      {!authenticated && services.length > 0 && (
        <div className="mt-8 p-6 rounded-xl border border-green-500/20 bg-[#F4C430]/100/5 text-center">
          <p className="text-white/70 mb-3">Sign in to hire an agent</p>
          <button
            onClick={login}
            className="px-6 py-2.5 rounded-lg bg-[#F4C430]/100 text-black font-medium hover:bg-green-400 transition"
          >
            Sign In with Email
          </button>
        </div>
      )}
    </div>
  );
}
