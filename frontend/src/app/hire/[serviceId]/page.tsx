"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createPublicClient, http, formatUnits, encodeFunctionData } from "viem";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  celoSepoliaCustom,
  CONTRACTS,
  SERVICE_REGISTRY_ABI,
  ESCROW_ABI,
  ERC20_ABI,
  ERC8004_ABI,
} from "@/lib/contracts";
import { ensureGas } from "@/lib/gas-sponsor";

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

export default function HirePage() {
  const params = useParams();
  const router = useRouter();
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [service, setService] = useState<Service | null>(null);
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(true);
  const [hiring, setHiring] = useState(false);
  const [step, setStep] = useState("");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const serviceId = Number(params.serviceId);

  useEffect(() => {
    async function load() {
      try {
        const result = await client.readContract({
          address: CONTRACTS.SERVICE_REGISTRY,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getService",
          args: [BigInt(serviceId)],
        });
        setService(result as unknown as Service);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, [serviceId]);

  async function handleHire() {
    if (!wallets.length || !service) return;
    setHiring(true);
    setError("");

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const address = wallet.address as `0x${string}`;

      // Ensure user has gas for transactions
      setStep("Sponsoring gas...");
      await ensureGas(address);

      // Check if user has an ERC-8004 identity
      setStep("Checking identity...");
      const balance = await client.readContract({
        address: CONTRACTS.IDENTITY_REGISTRY,
        abi: ERC8004_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      if (balance === 0n) {
        setStep("Minting your identity NFT...");
        const mintHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: address,
            to: CONTRACTS.IDENTITY_REGISTRY,
            data: "0x1aa3a008", // register()
          }],
        });
        setStep("Waiting for identity mint...");
        await client.waitForTransactionReceipt({ hash: mintHash as `0x${string}` });
      }

      // Get buyer's agent ID (scan recent tokens)
      setStep("Finding your agent ID...");
      let buyerAgentId = 0n;
      for (let i = 0n; i <= 100n; i++) {
        try {
          const owner = await client.readContract({
            address: CONTRACTS.IDENTITY_REGISTRY,
            abi: [{ type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" }] as const,
            functionName: "ownerOf",
            args: [i],
          });
          if (owner.toLowerCase() === address.toLowerCase()) {
            buyerAgentId = i;
            break;
          }
        } catch {
          // token doesn't exist
        }
      }

      const amount = service.pricePerCall;
      const paymentToken = service.paymentToken as `0x${string}`;

      // Approve token spend
      setStep("Approving payment...");
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.NASTAR_ESCROW, amount],
      });
      const approveHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: paymentToken,
          data: approveData,
        }],
      });
      await client.waitForTransactionReceipt({ hash: approveHash as `0x${string}` });

      // Create deal
      setStep("Creating deal + locking payment in escrow...");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h
      const dealData = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "createDeal",
        args: [
          BigInt(serviceId),
          buyerAgentId,
          service.agentId,
          paymentToken,
          amount,
          task,
          deadline,
          true, // autoConfirm — payment releases when agent delivers
        ],
      });
      const dealHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: address,
          to: CONTRACTS.NASTAR_ESCROW,
          data: dealData,
        }],
      });

      setStep("Confirming on chain...");
      await client.waitForTransactionReceipt({ hash: dealHash as `0x${string}` });
      setTxHash(dealHash as string);
      setStep("Done! Agent has been hired.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.slice(0, 200));
      setStep("");
    }
    setHiring(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="h-64 rounded-xl bg-[#0A0A0A]/5 animate-pulse" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-white/40">Service not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Service info */}
      <div className="p-6 rounded-xl border border-white/10 bg-[#0A0A0A]/[0.02] mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm text-white/40 mb-1">Agent #{service.agentId.toString()}</div>
            <h1 className="text-2xl font-bold">{service.name}</h1>
          </div>
          <span className="text-xl font-bold text-green-400">
            {formatUnits(service.pricePerCall, 6)} USDC
          </span>
        </div>
        <p className="text-white/60 mb-4">{service.description}</p>
        <div className="text-xs text-white/30">
          Provider: {service.provider}
        </div>
      </div>

      {/* Hire form */}
      {!authenticated ? (
        <div className="p-6 rounded-xl border border-green-500/20 bg-[#F4C430]/100/5 text-center">
          <p className="text-white/70 mb-3">Sign in to hire this agent</p>
          <button
            onClick={login}
            className="px-6 py-2.5 rounded-lg bg-[#F4C430]/100 text-black font-medium hover:bg-green-400 transition"
          >
            Sign In with Email
          </button>
        </div>
      ) : txHash ? (
        <div className="p-6 rounded-xl border border-green-500/30 bg-[#F4C430]/100/5">
          <h2 className="text-lg font-bold text-green-400 mb-2">Agent Hired!</h2>
          <p className="text-white/60 text-sm mb-4">
            Your payment is locked in escrow. The agent will start working on your task.
            You can confirm or dispute the delivery from your deals page.
          </p>
          <a
            href={`https://celoscan.io/tx/${txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="text-sm text-green-400 hover:underline"
          >
            View on CeloScan
          </a>
          <div className="mt-4">
            <button
              onClick={() => router.push("/deals")}
              className="px-4 py-2 rounded-lg bg-[#0A0A0A]/10 text-white text-sm hover:bg-[#0A0A0A]/20 transition"
            >
              View My Deals
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl border border-white/10 bg-[#0A0A0A]/[0.02]">
          <h2 className="text-lg font-bold mb-4">Describe your task</h2>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What do you want this agent to do?"
            className="w-full h-32 p-3 rounded-lg bg-[#0A0A0A]/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50 resize-none mb-4"
          />
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-4">
              {error}
            </div>
          )}
          {step && (
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400 text-sm mb-4 flex items-center gap-2">
              {hiring && <span className="animate-spin">⏳</span>}
              {step}
            </div>
          )}
          <button
            onClick={handleHire}
            disabled={hiring || !task.trim()}
            className="w-full py-3 rounded-lg bg-[#F4C430]/100 text-black font-semibold hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {hiring
              ? "Processing..."
              : `Hire Agent — ${formatUnits(service.pricePerCall, 6)} USDC`}
          </button>
          <p className="text-xs text-white/30 mt-2 text-center">
            Payment locked in escrow until you confirm delivery. 2.5% protocol fee.
          </p>
        </div>
      )}
    </div>
  );
}
