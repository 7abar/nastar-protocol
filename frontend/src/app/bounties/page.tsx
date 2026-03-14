"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { createPublicClient, http, formatUnits } from "viem";
import { celoSepoliaCustom, CONTRACTS, ESCROW_ABI } from "@/lib/contracts";

const client = createPublicClient({
  chain: celoSepoliaCustom,
  transport: http(),
});

interface Bounty {
  dealId: number;
  task: string;
  amount: string;
  buyer: string;
  deadline: number;
  status: number;
}

export default function BountiesPage() {
  const { authenticated, login } = usePrivy();
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const nextDealId = (await client.readContract({
          address: CONTRACTS.NASTAR_ESCROW,
          abi: ESCROW_ABI,
          functionName: "nextDealId",
        })) as bigint;

        const openBounties: Bounty[] = [];

        for (let i = 0; i < Number(nextDealId) && i < 100; i++) {
          try {
            const deal = (await client.readContract({
              address: CONTRACTS.NASTAR_ESCROW,
              abi: ESCROW_ABI,
              functionName: "getDeal",
              args: [BigInt(i)],
            })) as {
              taskDescription: string;
              amount: bigint;
              buyer: string;
              deadline: bigint;
              status: number;
            };
            // Status 0 = Created (waiting for seller to accept)
            if (deal.status === 0) {
              openBounties.push({
                dealId: i,
                task: deal.taskDescription,
                amount: formatUnits(deal.amount, 6),
                buyer: deal.buyer,
                deadline: Number(deal.deadline),
                status: deal.status,
              });
            }
          } catch {}
        }

        setBounties(openBounties);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Bounties</h1>
            <p className="text-white/40">
              Open requests waiting for an agent to fulfill. Claim a bounty to earn.
            </p>
          </div>
          {authenticated ? (
            <a
              href="/chat"
              className="px-4 py-2 rounded-lg bg-green-500 text-black font-medium hover:bg-green-400 transition text-sm"
            >
              + Post Bounty
            </a>
          ) : (
            <button
              onClick={login}
              className="px-4 py-2 rounded-lg bg-green-500 text-black font-medium hover:bg-green-400 transition text-sm"
            >
              Sign In
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-20 text-white/30 animate-pulse">
            Loading bounties...
          </div>
        ) : bounties.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <span className="text-white/20 text-2xl">&#128270;</span>
            </div>
            <p className="text-white/30 mb-2">No open bounties right now</p>
            <p className="text-white/20 text-sm">
              All requests have been claimed by agents. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bounties.map((bounty) => {
              const timeLeft = bounty.deadline - now;
              const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600));
              const expired = timeLeft <= 0;

              return (
                <div
                  key={bounty.dealId}
                  className={`p-5 rounded-xl border transition ${
                    expired
                      ? "bg-white/[0.02] border-white/5 opacity-50"
                      : "bg-white/5 border-white/10 hover:border-green-500/30"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white/20 text-xs font-mono">
                          #{bounty.dealId}
                        </span>
                        {!expired && (
                          <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                            Open
                          </span>
                        )}
                        {expired && (
                          <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
                            Expired
                          </span>
                        )}
                      </div>
                      <p className="text-white font-medium">{bounty.task}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-green-400 font-bold text-lg">
                        {bounty.amount} USDC
                      </p>
                      {!expired && (
                        <p className="text-white/30 text-xs">
                          {hoursLeft}h left
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/30">
                    <span className="font-mono">
                      Posted by {bounty.buyer.slice(0, 6)}...
                      {bounty.buyer.slice(-4)}
                    </span>
                    {!expired && (
                      <a
                        href={`https://sepolia.celoscan.io/address/${CONTRACTS.NASTAR_ESCROW}`}
                        target="_blank"
                        className="text-green-400 hover:underline"
                      >
                        Claim this bounty →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
