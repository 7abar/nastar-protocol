"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { celoSepoliaCustom, CONTRACTS, ESCROW_ABI } from "@/lib/contracts";
import { DealCard } from "@/components/DealCard";

const client = createPublicClient({
  chain: celoSepoliaCustom,
  transport: http(),
});

interface Deal {
  dealId: bigint;
  serviceId: bigint;
  buyerAgentId: bigint;
  sellerAgentId: bigint;
  buyer: string;
  seller: string;
  paymentToken: string;
  amount: bigint;
  taskDescription: string;
  deliveryProof: string;
  status: number;
  createdAt: bigint;
  deadline: bigint;
  completedAt: bigint;
  disputedAt: bigint;
}

export default function DealsPage() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated || !wallets.length) {
      setLoading(false);
      return;
    }
    loadDeals();
  }, [authenticated, wallets]);

  async function loadDeals() {
    setLoading(true);
    try {
      const nextId = await client.readContract({
        address: CONTRACTS.NASTAR_ESCROW,
        abi: ESCROW_ABI,
        functionName: "nextDealId",
      }) as bigint;

      const address = wallets[0].address.toLowerCase();
      const loaded: Deal[] = [];

      for (let i = 0n; i < nextId; i++) {
        try {
          const deal = await client.readContract({
            address: CONTRACTS.NASTAR_ESCROW,
            abi: ESCROW_ABI,
            functionName: "getDeal",
            args: [i],
          }) as unknown as Deal;

          if (
            deal.buyer.toLowerCase() === address ||
            deal.seller.toLowerCase() === address
          ) {
            loaded.push(deal);
          }
        } catch {}
      }

      setDeals(loaded.reverse());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function sendTx(dealId: bigint, functionName: string) {
    if (!wallets.length) return;
    setActionLoading(dealId.toString() + functionName);

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const address = wallet.address as `0x${string}`;
      const { encodeFunctionData } = await import("viem");

      const data = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: functionName as "confirmDelivery",
        args: [dealId],
      });

      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: CONTRACTS.NASTAR_ESCROW,
          data,
        }],
      });

      await client.waitForTransactionReceipt({ hash: hash as `0x${string}` });
      await loadDeals();
    } catch (err) {
      console.error(err);
    }
    setActionLoading(null);
  }

  if (!authenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">My Deals</h1>
        <p className="text-[#A1A1A1] mb-6">Sign in to see your deals</p>
        <button
          onClick={login}
          className="px-6 py-2.5 rounded-lg gradient-btn font-medium hover:shadow-[0_0_15px_#F4C430] transition"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Deals</h1>
          <p className="text-[#A1A1A1] text-sm mt-1">
            Track your active and past deals
          </p>
        </div>
        <button
          onClick={loadDeals}
          className="px-3 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 transition"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[#A1A1A1]/60 text-lg mb-2">No deals yet</p>
          <p className="text-[#A1A1A1]/60 text-sm">
            Hire an agent from the marketplace to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deals.map((deal) => (
            <DealCard
              key={deal.dealId.toString()}
              deal={deal}
              onConfirm={() => sendTx(deal.dealId, "confirmDelivery")}
              onDispute={() => sendTx(deal.dealId, "disputeDeal")}
              onRefund={() => sendTx(deal.dealId, "claimRefund")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
