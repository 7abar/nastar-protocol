"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { createPublicClient, http, encodeFunctionData } from "viem";
import {
  celoSepoliaCustom,
  CONTRACTS,
  SERVICE_REGISTRY_ABI,
  ERC8004_ABI,
} from "@/lib/contracts";
import {
  generateApiKey,
  generateAgentWallet,
  storeAgent,
  type RegisteredAgent,
} from "@/lib/agents-api";
import { SetupTabs } from "@/components/SetupTabs";

const client = createPublicClient({
  chain: celoSepoliaCustom,
  transport: http(),
});

type Step = "form" | "deploying" | "done";

export default function RegisterAgentPage() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [price, setPrice] = useState("5");
  const [tags, setTags] = useState("ai,agent");

  // Result
  const [result, setResult] = useState<{
    agentWallet: string;
    apiKey: string;
    agentId: string;
    serviceId: string;
  } | null>(null);

  async function handleRegister() {
    if (!wallets.length) return;
    setStep("deploying");
    setError("");

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const ownerAddress = wallet.address as `0x${string}`;

      // 1. Generate agent wallet
      setStatus("Generating agent wallet...");
      const agentWallet = generateAgentWallet();

      // 2. Mint ERC-8004 identity for agent
      // For hackathon: the owner mints on behalf, then the agent NFT is associated
      setStatus("Minting ERC-8004 identity NFT...");

      // Check if owner already has an identity
      const ownerBalance = (await client.readContract({
        address: CONTRACTS.IDENTITY_REGISTRY,
        abi: ERC8004_ABI,
        functionName: "balanceOf",
        args: [ownerAddress],
      })) as bigint;

      let agentNftId: number | null = null;

      if (ownerBalance === 0n) {
        const mintHash = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: ownerAddress,
              to: CONTRACTS.IDENTITY_REGISTRY,
              data: "0x1aa3a008", // register()
            },
          ],
        });
        await client.waitForTransactionReceipt({
          hash: mintHash as `0x${string}`,
        });
        setStatus("Identity minted!");
      }

      // Find owner's agent ID
      for (let i = 0n; i <= 200n; i++) {
        try {
          const owner = (await client.readContract({
            address: CONTRACTS.IDENTITY_REGISTRY,
            abi: [
              {
                type: "function",
                name: "ownerOf",
                inputs: [{ name: "tokenId", type: "uint256" }],
                outputs: [{ type: "address" }],
                stateMutability: "view",
              },
            ] as const,
            functionName: "ownerOf",
            args: [i],
          })) as string;
          if (owner.toLowerCase() === ownerAddress.toLowerCase()) {
            agentNftId = Number(i);
            break;
          }
        } catch {
          // token doesn't exist yet
        }
      }

      // 3. Register service on-chain
      setStatus("Registering service on-chain...");
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const priceWei = BigInt(Math.round(parseFloat(price) * 1e6)); // 6 decimals

      const regData = encodeFunctionData({
        abi: SERVICE_REGISTRY_ABI,
        functionName: "registerService",
        args: [
          BigInt(agentNftId || 0),
          name,
          description,
          endpoint || `https://nastar.dev/api/agents/${name.toLowerCase().replace(/\s+/g, "-")}`,
          CONTRACTS.MOCK_USDC,
          priceWei,
          tagList,
        ],
      });

      const regHash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: ownerAddress,
            to: CONTRACTS.SERVICE_REGISTRY,
            data: regData,
          },
        ],
      });
      const receipt = await client.waitForTransactionReceipt({
        hash: regHash as `0x${string}`,
      });

      // Parse serviceId from event logs
      const serviceRegTopic =
        "0x2f97baea4f38ff977318c4e4648cfa7b665121ba164e1cb7070d29a78f59f475";
      const regLog = receipt.logs.find((l) => l.topics[0] === serviceRegTopic);
      const serviceId = regLog ? parseInt(regLog.topics[1] || "0", 16) : 0;

      // 4. Generate API key
      setStatus("Generating API key...");
      const apiKey = generateApiKey();

      // 5. Store agent locally
      const agentRecord: RegisteredAgent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        description,
        ownerAddress,
        agentWallet: agentWallet.address,
        agentPrivateKey: agentWallet.privateKey,
        apiKey,
        apiKeyActive: true,
        agentNftId,
        serviceId,
        endpoint:
          endpoint ||
          `https://nastar.dev/api/agents/${name.toLowerCase().replace(/\s+/g, "-")}`,
        tags: tagList,
        pricePerCall: price,
        paymentToken: CONTRACTS.MOCK_USDC,
        avatar: null,
        createdAt: Date.now(),
      };
      storeAgent(agentRecord);

      setResult({
        agentWallet: agentWallet.address,
        apiKey,
        agentId: agentNftId?.toString() || "pending",
        serviceId: serviceId.toString(),
      });
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.slice(0, 200));
      setStep("form");
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            Register Your Agent
          </h1>
          <p className="text-white/40 mb-6">Sign in to get started</p>
          <button
            onClick={login}
            className="px-6 py-3 rounded-xl bg-green-500 text-black font-medium hover:bg-green-400 transition"
          >
            Sign In with Email
          </button>
        </div>
      </div>
    );
  }

  if (step === "done" && result) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-green-400 text-2xl">&#10003;</span>
            </div>
            <h1 className="text-2xl font-bold">Agent Registered!</h1>
            <p className="text-white/40 mt-2">
              Your agent is live on the Nastar network
            </p>
          </div>

          {/* Agent Details */}
          <div className="space-y-4">
            {/* Name */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <label className="text-white/40 text-xs uppercase tracking-wider">
                Agent Name
              </label>
              <p className="text-white font-medium mt-1">{name}</p>
            </div>

            {/* Wallet */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <label className="text-white/40 text-xs uppercase tracking-wider">
                Agent Wallet Address
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-green-400 text-sm font-mono break-all">
                  {result.agentWallet}
                </code>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(result.agentWallet)
                  }
                  className="text-white/30 hover:text-white transition text-xs"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* API Key */}
            <div className="p-4 rounded-xl bg-white/5 border border-green-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-wider">
                    API Key
                  </label>
                  <p className="text-white/50 text-xs mt-0.5">
                    For external integrations (OpenClaw, custom agents)
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                  Active
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-green-400 text-sm font-mono break-all bg-black/50 px-3 py-2 rounded-lg flex-1">
                  {result.apiKey}
                </code>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(result.apiKey)
                  }
                  className="text-white/30 hover:text-white transition text-xs"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <h3 className="font-semibold text-white mb-3">
                Give Your Agent Access to Nastar
              </h3>
              <SetupTabs apiKey={result.apiKey} />
            </div>

            {/* IDs */}
            <div className="flex gap-4">
              <div className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10">
                <label className="text-white/30 text-xs">Agent NFT ID</label>
                <p className="text-white font-mono text-sm mt-0.5">
                  #{result.agentId}
                </p>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10">
                <label className="text-white/30 text-xs">Service ID</label>
                <p className="text-white font-mono text-sm mt-0.5">
                  #{result.serviceId}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={() => router.push("/agents")}
              className="flex-1 py-3 rounded-xl bg-white/5 text-white font-medium hover:bg-white/10 transition"
            >
              View All Agents
            </button>
            <button
              onClick={() => router.push("/chat")}
              className="flex-1 py-3 rounded-xl bg-green-500 text-black font-medium hover:bg-green-400 transition"
            >
              Test in Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-2">Register Your Agent</h1>
        <p className="text-white/40 mb-8">
          Deploy an AI agent on Nastar. Get a wallet address and API key.
        </p>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {step === "deploying" ? (
          <div className="text-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white/60">{status}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="text-white/60 text-sm mb-1 block">
                Agent Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. DataScraper Pro"
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-green-500/50"
              />
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1 block">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does your agent do?"
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-green-500/50 resize-none"
              />
            </div>

            <div>
              <label className="text-white/60 text-sm mb-1 block">
                Endpoint URL
              </label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-agent.com/api (optional)"
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-green-500/50"
              />
              <p className="text-white/20 text-xs mt-1">
                Where your agent receives tasks. Leave empty for now.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-white/60 text-sm mb-1 block">
                  Price per Call (USDC)
                </label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0.001"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-green-500/50"
                />
              </div>
              <div>
                <label className="text-white/60 text-sm mb-1 block">
                  Tags
                </label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="ai, data, scraping"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-green-500/50"
                />
              </div>
            </div>

            <button
              onClick={handleRegister}
              disabled={!name.trim() || !description.trim()}
              className="w-full py-3 rounded-xl bg-green-500 text-black font-semibold hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition mt-4"
            >
              Register Agent
            </button>

            <p className="text-white/20 text-xs text-center">
              This will mint an ERC-8004 identity NFT, register your service
              on-chain, and generate an API key.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
