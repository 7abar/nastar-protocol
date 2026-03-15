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
  TOKEN_LIST,
  CELO_TOKENS,
} from "@/lib/contracts";
import { generateApiKey, generateAgentWallet, storeAgent } from "@/lib/agents-api";

// Lazy-load ReactFlow (heavy, client-only)

const client = createPublicClient({ chain: celoSepoliaCustom, transport: http() });
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "trading",
    icon: "📈",
    name: "Trading Bot",
    tagline: "DeFi automation on Celo",
    description: "Monitors markets and executes token swaps based on configurable thresholds.",
    tags: ["trading", "defi", "celo"],
    defaultPrice: "2",
    systemPrompt: `You are a DeFi trading agent on Celo. Your job is to:
- Monitor token prices on Celo DEXes (Uniswap v3, Ubeswap)
- Execute buy/sell swaps when configured thresholds are met
- Report all actions with transaction hashes
- Never exceed the configured spending limit per operation
- Always confirm before executing trades above $50

You have access to the user's scoped wallet with spend limits. Be conservative and transparent.`,
  },
  {
    id: "payments",
    icon: "💸",
    name: "Payment Agent",
    tagline: "Automate stablecoin payments",
    description: "Schedules and executes recurring USDC/cUSD payments on behalf of users.",
    tags: ["payments", "usdc", "automation"],
    defaultPrice: "0.5",
    systemPrompt: `You are a payment automation agent on Celo. Your job is to:
- Process payment requests in USDC and cUSD
- Schedule recurring transfers based on user instructions
- Verify recipient addresses before sending
- Generate payment receipts with transaction hashes
- Enforce daily spending limits strictly

Never send to unverified addresses. Always log every transaction.`,
  },
  {
    id: "social",
    icon: "📢",
    name: "Social Bot",
    tagline: "Onchain social actions",
    description: "Posts content, follows accounts, and engages on Farcaster and Lens on your behalf.",
    tags: ["social", "farcaster", "lens"],
    defaultPrice: "1",
    systemPrompt: `You are a social media agent for Web3 platforms (Farcaster, Lens). Your job is to:
- Post content based on user-provided topics and tone
- Engage with relevant casts/posts in the user's niche
- Follow relevant accounts when instructed
- Never post controversial political content
- Always maintain the user's configured brand voice

Only post content the user explicitly approves or that matches approved templates.`,
  },
  {
    id: "research",
    icon: "🔍",
    name: "Research Agent",
    tagline: "Onchain data intelligence",
    description: "Monitors wallets, contracts, and governance. Delivers daily digests.",
    tags: ["research", "analytics", "governance"],
    defaultPrice: "1.5",
    systemPrompt: `You are a blockchain research agent on Celo. Your job is to:
- Monitor specified wallet addresses for activity
- Track Celo governance proposals and summarize them
- Analyze token movements and flag unusual patterns
- Deliver daily digests in plain language
- Respond to research queries about onchain data

Be factual, cite transaction hashes, and flag uncertainty clearly.`,
  },
  {
    id: "remittance",
    icon: "🌍",
    name: "Remittance Agent",
    tagline: "Cross-border transfers on Celo",
    description: "Understands natural language remittance requests and executes transfers using Mento stablecoins. Supports multiple corridors and languages.",
    tags: ["remittance", "mento", "global-south", "payments"],
    defaultPrice: "0.5",
    systemPrompt: `You are a cross-border remittance agent on Celo. Your job is to:
- Parse natural language transfer requests like "Send $50 to my mom in the Philippines"
- Find the cheapest route using Mento pools (USD→PHP, EUR→NGN, GBP→KES)
- Execute stablecoin swaps (USDm, EURm, BRLm, COPm, XOFm) via Mento Protocol
- Show fee comparisons vs traditional providers (Western Union: ~7%, Wise: ~1.5%, Nastar: <0.5%)
- Support multi-language input (English, Spanish, Portuguese, French)
- Schedule recurring transfers when requested
- Send notifications to recipients via SMS/WhatsApp

Never send to unverified addresses. Always confirm amounts before executing. Show total savings vs traditional remittance.`,
  },
  {
    id: "fx-hedge",
    icon: "🛡️",
    name: "FX Hedging Agent",
    tagline: "Automated currency hedging",
    description: "Monitors multi-currency exposure and auto-rebalances using Mento stablecoins. Set target allocations and let the agent maintain them.",
    tags: ["fx", "hedging", "mento", "defi", "treasury"],
    defaultPrice: "3",
    systemPrompt: `You are an FX hedging agent on Celo. Your job is to:
- Track portfolio exposure across multiple Celo stablecoins (USDm, EURm, BRLm, COPm, XOFm)
- Monitor drift from user-configured target allocations
- Execute rebalancing swaps via Mento Protocol when drift exceeds threshold
- Optimize swap timing to minimize slippage and gas costs
- Factor in expected future cash flows ("I'll receive €5000 next week")
- Generate daily risk reports showing currency movements and hedging costs
- Enforce maximum single-swap size limits

Example allocation: "Keep 50% in USDm, 30% in EURm, 20% in BRLm"
Rebalance when any position drifts more than 5% from target.
Never rebalance more than 3 times per day. Report all swaps with tx hashes.`,
  },
  {
    id: "custom",
    icon: "⚡",
    name: "Custom Agent",
    tagline: "Build your own",
    description: "Blank slate — write your own system prompt and configure everything from scratch.",
    tags: ["custom"],
    defaultPrice: "1",
    systemPrompt: "",
  },
];

const LLM_PROVIDERS = [
  { id: "openai", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  { id: "anthropic", name: "Anthropic", models: ["claude-sonnet-4-5", "claude-haiku-3-5"] },
  { id: "google", name: "Google", models: ["gemini-2.0-flash", "gemini-1.5-pro"] },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "template" | "configure" | "llm" | "limits" | "deploying" | "done";

interface LaunchConfig {
  templateId: string;
  name: string;
  description: string;
  systemPrompt: string;
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  maxPerCallUsd: string;
  dailyLimitUsd: string;
  requireConfirmAboveUsd: string;
  price: string;
  tags: string;
  paymentToken: `0x${string}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LaunchPage() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();

  const [step, setStep] = useState<Step>("template");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [deployedId, setDeployedId] = useState("");

  const [config, setConfig] = useState<LaunchConfig>({
    templateId: "",
    name: "",
    description: "",
    systemPrompt: "",
    llmProvider: "openai",
    llmModel: "gpt-4o-mini",
    llmApiKey: "",
    maxPerCallUsd: "10",
    dailyLimitUsd: "50",
    requireConfirmAboveUsd: "25",
    price: "1",
    tags: "",
    paymentToken: CELO_TOKENS.USDm,
  });

  function selectTemplate(t: typeof TEMPLATES[0]) {
    setConfig((c) => ({
      ...c,
      templateId: t.id,
      name: t.id === "custom" ? "" : t.name,
      description: t.id === "custom" ? "" : t.description,
      systemPrompt: t.systemPrompt,
      price: t.defaultPrice,
      tags: t.tags.join(", "),
    }));
    setStep("configure");
  }

  const selectedProvider = LLM_PROVIDERS.find((p) => p.id === config.llmProvider)!;

  async function handleDeploy() {
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

      // 2. Mint ERC-8004 identity
      setStatus("Minting ERC-8004 identity...");
      const ownerBalance = (await client.readContract({
        address: CONTRACTS.IDENTITY_REGISTRY,
        abi: ERC8004_ABI,
        functionName: "balanceOf",
        args: [ownerAddress],
      })) as bigint;

      let agentNftId: number | null = null;

      if (ownerBalance === 0n) {
        const registerData = encodeFunctionData({
          abi: ERC8004_ABI,
          functionName: "register",
          args: [`${API_URL}/api/agent-registration/pending`],
        });
        const mintHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{ from: ownerAddress, to: CONTRACTS.IDENTITY_REGISTRY, data: registerData }],
        });
        await client.waitForTransactionReceipt({ hash: mintHash as `0x${string}` });
      }

      for (let i = 0n; i <= 200n; i++) {
        try {
          const owner = (await client.readContract({
            address: CONTRACTS.IDENTITY_REGISTRY,
            abi: [{ type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" }] as const,
            functionName: "ownerOf",
            args: [i],
          })) as string;
          if (owner.toLowerCase() === ownerAddress.toLowerCase()) { agentNftId = Number(i); break; }
        } catch { /* token doesn't exist */ }
      }

      // 3. Register service on-chain
      setStatus("Registering service on-chain...");
      const tagList = config.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const priceWei = BigInt(Math.round(parseFloat(config.price) * 1e6));

      const hostedEndpoint = `${API_URL}/v1/hosted/${agentWallet.address}`;

      const regData = encodeFunctionData({
        abi: SERVICE_REGISTRY_ABI,
        functionName: "registerService",
        args: [
          BigInt(agentNftId || 0),
          config.name,
          config.description,
          hostedEndpoint,
          config.paymentToken,
          priceWei,
          tagList,
        ],
      });
      const regHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: ownerAddress, to: CONTRACTS.SERVICE_REGISTRY, data: regData }],
      });
      const receipt = await client.waitForTransactionReceipt({ hash: regHash as `0x${string}` });

      const serviceRegTopic = "0x2f97baea4f38ff977318c4e4648cfa7b665121ba164e1cb7070d29a78f59f475";
      const regLog = receipt.logs.find((l) => l.topics[0] === serviceRegTopic);
      const serviceId = regLog ? parseInt(regLog.topics[1] || "0", 16) : 0;

      // 4. Update agent URI
      if (agentNftId !== null) {
        setStatus("Linking agent metadata...");
        const agentURI = `${API_URL}/api/agent-registration/${agentNftId}`;
        const setUriData = encodeFunctionData({
          abi: ERC8004_ABI,
          functionName: "setAgentURI",
          args: [BigInt(agentNftId), agentURI],
        });
        try {
          const uriHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{ from: ownerAddress, to: CONTRACTS.IDENTITY_REGISTRY, data: setUriData }],
          });
          await client.waitForTransactionReceipt({ hash: uriHash as `0x${string}` });
        } catch { /* non-critical */ }
      }

      // 5. Generate API key & store locally
      setStatus("Finalizing configuration...");
      const apiKey = generateApiKey();

      storeAgent({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: config.name,
        description: config.description,
        ownerAddress,
        agentWallet: agentWallet.address,
        agentPrivateKey: agentWallet.privateKey,
        apiKey,
        apiKeyActive: true,
        agentNftId,
        serviceId,
        endpoint: hostedEndpoint,
        tags: tagList,
        pricePerCall: config.price,
        paymentToken: config.paymentToken,
        avatar: null,
        createdAt: Date.now(),
      });

      // 6. Store hosted config in API
      setStatus("Starting hosted agent runtime...");
      try {
        await fetch(`${API_URL}/v1/hosted`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentWallet: agentWallet.address,
            agentPrivateKey: agentWallet.privateKey,
            ownerAddress,
            apiKey,
            agentNftId,
            serviceId,
            name: config.name,
            description: config.description,
            templateId: config.templateId,
            systemPrompt: config.systemPrompt,
            llmProvider: config.llmProvider,
            llmModel: config.llmModel,
            llmApiKey: config.llmApiKey,
            spendingLimits: {
              maxPerCallUsd: parseFloat(config.maxPerCallUsd),
              dailyLimitUsd: parseFloat(config.dailyLimitUsd),
              requireConfirmAboveUsd: parseFloat(config.requireConfirmAboveUsd),
            },
          }),
        });
      } catch { /* API not deployed yet — config stored locally */ }

      setDeployedId(agentWallet.address);
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.slice(0, 200));
      setStep("limits");
    }
  }

  // ─── Not authenticated ──────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-5xl mb-4">⚡</div>
          <h1 className="text-3xl font-bold text-white mb-3">Agent Launcher</h1>
          <p className="text-[#A1A1A1] mb-8">
            Deploy a hosted AI agent on Celo in under 2 minutes. No code required.
          </p>
          <button onClick={login} className="px-8 py-3 rounded-xl gradient-btn font-semibold hover:shadow-[0_0_15px_#F4C430] transition">
            Connect Wallet to Start
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: Template ─────────────────────────────────────────────────────────

  if (step === "template") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4C430]/10 text-[#F4C430] text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F4C430] animate-pulse" />
              No-Code Agent Launcher
            </div>
            <h1 className="text-3xl font-bold mb-2">Choose a Template</h1>
            <p className="text-[#A1A1A1]">
              Pick a starting point. You can customize everything in the next steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTemplate(t)}
                className="text-left p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-[#F4C430]/50 hover:bg-[#F4C430]/5 transition group"
              >
                <div className="text-3xl mb-3">{t.icon}</div>
                <h3 className="font-semibold text-white text-lg mb-1 group-hover:text-[#F4C430] transition">{t.name}</h3>
                <p className="text-[#F4C430]/70 text-xs font-medium mb-2">{t.tagline}</p>
                <p className="text-[#A1A1A1] text-sm leading-relaxed">{t.description}</p>
                <div className="flex flex-wrap gap-1 mt-4">
                  {t.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded text-xs bg-white/10 text-[#A1A1A1]">{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Configure ────────────────────────────────────────────────────────

  if (step === "configure") {
    const tmpl = TEMPLATES.find((t) => t.id === config.templateId)!;

    return (
      <div className="bg-[#0A0A0A] text-[#F5F5F5] min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-12">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("template")} className="text-[#A1A1A1] text-sm hover:text-white transition mr-2">
                ←
              </button>
              <span className="text-2xl">{tmpl.icon}</span>
              <div>
                <h1 className="text-xl font-bold">{tmpl.name}</h1>
                <p className="text-[#A1A1A1] text-xs">Configure your agent</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-5">
            {/* Agent Icon */}
            <div>
              <label className="text-[#A1A1A1] text-sm mb-2 block">Agent Icon</label>
              <div className="flex flex-wrap gap-2">
                {["🤖", "🔍", "🌐", "🛡️", "📊", "⚡", "💬", "🧠", "📝", "🎨", "💰", "🔗"].map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, icon }))}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl transition ${
                      (config as any).icon === icon
                        ? "bg-[#F4C430]/20 border-2 border-[#F4C430] shadow-[0_0_12px_rgba(244,196,48,0.3)]"
                        : "bg-white/[0.04] border border-white/[0.08] hover:border-[#F4C430]/40"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[#A1A1A1] text-sm mb-1 block">Agent Name *</label>
              <input
                value={config.name}
                onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
                placeholder={`e.g. My ${tmpl.name}`}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white placeholder-white/20 focus:outline-none focus:border-[#F4C430]/70"
              />
            </div>

            <div>
              <label className="text-[#A1A1A1] text-sm mb-1 block">Description *</label>
              <textarea
                value={config.description}
                onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
                placeholder="What does this agent do for you?"
                rows={2}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white placeholder-white/20 focus:outline-none focus:border-[#F4C430]/70 resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[#A1A1A1] text-sm">System Prompt *</label>
                <span className="text-xs text-[#F4C430]/60">Pre-filled from template — edit freely</span>
              </div>
              <textarea
                value={config.systemPrompt}
                onChange={(e) => setConfig((c) => ({ ...c, systemPrompt: e.target.value }))}
                placeholder="Define how your agent thinks and behaves..."
                rows={8}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white placeholder-white/20 focus:outline-none focus:border-[#F4C430]/70 resize-none font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[#A1A1A1] text-sm mb-1 block">
                  Price per Call
                  <span className="ml-1.5 text-[10px] text-[#A1A1A1]/50 font-normal">— buyers pay this per task</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={config.price}
                    onChange={(e) => setConfig((c) => ({ ...c, price: e.target.value }))}
                    type="number" step="0.01" min="0.01"
                    className="flex-1 px-4 py-3 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white focus:outline-none focus:border-[#F4C430]/70"
                  />
                  <select
                    value={config.paymentToken}
                    onChange={(e) => setConfig((c) => ({ ...c, paymentToken: e.target.value as `0x${string}` }))}
                    className="px-3 py-3 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white focus:outline-none focus:border-[#F4C430]/70 text-sm"
                  >
                    {TOKEN_LIST.map((t) => (
                      <option key={t.address} value={t.address} className="bg-[#111]">
                        {t.flag} {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[#A1A1A1] text-sm mb-1 block">Tags</label>
                <input
                  value={config.tags}
                  onChange={(e) => setConfig((c) => ({ ...c, tags: e.target.value }))}
                  placeholder="trading, defi, celo"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white placeholder-white/20 focus:outline-none focus:border-[#F4C430]/70"
                />
              </div>
            </div>

            <button
              onClick={() => setStep("llm")}
              disabled={!config.name.trim() || !config.systemPrompt.trim()}
              className="w-full py-3 rounded-xl gradient-btn font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_15px_#F4C430] transition"
            >
              Next: LLM Backend →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: LLM ──────────────────────────────────────────────────────────────

  if (step === "llm") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <button onClick={() => setStep("configure")} className="text-[#A1A1A1] text-sm mb-6 hover:text-white transition flex items-center gap-1">
            ← Back
          </button>

          <h1 className="text-2xl font-bold mb-2">LLM Backend</h1>
          <p className="text-[#A1A1A1] mb-8">Choose the AI model that powers your agent.</p>

          <div className="space-y-5">
            <div>
              <label className="text-[#A1A1A1] text-sm mb-2 block">Provider</label>
              <div className="grid grid-cols-3 gap-3">
                {LLM_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setConfig((c) => ({ ...c, llmProvider: p.id, llmModel: p.models[0] }))}
                    className={`py-3 rounded-xl border font-medium transition text-sm ${
                      config.llmProvider === p.id
                        ? "border-[#F4C430] bg-[#F4C430]/10 text-[#F4C430]"
                        : "border-white/10 bg-white/5 text-[#A1A1A1] hover:border-white/30"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[#A1A1A1] text-sm mb-2 block">Model</label>
              <div className="grid grid-cols-2 gap-3">
                {selectedProvider.models.map((m) => (
                  <button
                    key={m}
                    onClick={() => setConfig((c) => ({ ...c, llmModel: m }))}
                    className={`py-2.5 px-4 rounded-lg border font-mono text-sm transition ${
                      config.llmModel === m
                        ? "border-[#F4C430] bg-[#F4C430]/10 text-[#F4C430]"
                        : "border-white/10 bg-white/5 text-[#A1A1A1] hover:border-white/30"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[#A1A1A1] text-sm mb-1 block">
                {selectedProvider.name} API Key *
              </label>
              {(() => {
                const key = config.llmApiKey.trim();
                const valid =
                  config.llmProvider === "openai" ? /^sk-[A-Za-z0-9_-]{20,}$/.test(key) :
                  config.llmProvider === "anthropic" ? /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key) :
                  config.llmProvider === "google" ? /^AIza[A-Za-z0-9_-]{30,}$/.test(key) :
                  key.length > 10;
                const placeholder =
                  config.llmProvider === "openai" ? "sk-proj-..." :
                  config.llmProvider === "anthropic" ? "sk-ant-api03-..." : "AIzaSy...";
                return (
                  <>
                    <div className="relative">
                      <input
                        type="password"
                        value={config.llmApiKey}
                        onChange={(e) => setConfig((c) => ({ ...c, llmApiKey: e.target.value }))}
                        placeholder={placeholder}
                        className={`w-full px-4 py-3 pr-10 rounded-lg bg-white/5 border text-white placeholder-white/20 focus:outline-none font-mono text-sm transition ${
                          key.length === 0 ? "border-[#F4C430]/30 focus:border-[#F4C430]/70" :
                          valid ? "border-green-400/50 focus:border-green-400" :
                          "border-red-400/50 focus:border-red-400"
                        }`}
                      />
                      {key.length > 0 && (
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-lg ${valid ? "text-green-400" : "text-red-400"}`}>
                          {valid ? "✓" : "✗"}
                        </span>
                      )}
                    </div>
                    {key.length > 0 && !valid && (
                      <p className="text-red-400 text-xs mt-1.5">
                        {config.llmProvider === "openai" ? 'Must start with "sk-" — get yours at platform.openai.com' :
                         config.llmProvider === "anthropic" ? 'Must start with "sk-ant-" — get yours at console.anthropic.com' :
                         'Must start with "AIza" — get yours at aistudio.google.com'}
                      </p>
                    )}
                    {valid && (
                      <p className="text-green-400/70 text-xs mt-1.5">Key format valid. Stored encrypted in your hosted runtime.</p>
                    )}
                    {key.length === 0 && (
                      <p className="text-[#A1A1A1]/40 text-xs mt-1">
                        Stored encrypted. Used only by your agent runtime.
                      </p>
                    )}
                    <div className="mt-2 p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-[#A1A1A1]">
                      Get your key: {" "}
                      {config.llmProvider === "openai" && <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" className="text-[#F4C430] underline">platform.openai.com/api-keys</a>}
                      {config.llmProvider === "anthropic" && <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" className="text-[#F4C430] underline">console.anthropic.com</a>}
                      {config.llmProvider === "google" && <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" className="text-[#F4C430] underline">aistudio.google.com</a>}
                    </div>
                  </>
                );
              })()}
            </div>

            {(() => {
              const key = config.llmApiKey.trim();
              const valid =
                config.llmProvider === "openai" ? /^sk-[A-Za-z0-9_-]{20,}$/.test(key) :
                config.llmProvider === "anthropic" ? /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key) :
                config.llmProvider === "google" ? /^AIza[A-Za-z0-9_-]{30,}$/.test(key) :
                key.length > 10;
              return (
                <button
                  onClick={() => setStep("limits")}
                  disabled={!valid}
                  className="w-full py-3 rounded-xl gradient-btn font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_15px_#F4C430] transition"
                >
                  Next: Spending Limits →
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Limits ───────────────────────────────────────────────────────────

  if (step === "limits") {
    const tmpl = TEMPLATES.find((t) => t.id === config.templateId)!;
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <button onClick={() => setStep("llm")} className="text-[#A1A1A1] text-sm mb-6 hover:text-white transition flex items-center gap-1">
            ← Back
          </button>

          <h1 className="text-2xl font-bold mb-2">Spending Limits & Guardrails</h1>
          <p className="text-[#A1A1A1] mb-8">
            Define hard limits on what your agent can spend. These are enforced on-chain.
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-[#F4C430]/20">
                <label className="text-white font-medium text-sm block mb-1">Max per operation (USD)</label>
                <p className="text-[#A1A1A1] text-xs mb-3">Hard cap on a single transaction or action.</p>
                <input
                  type="number" step="1" min="1"
                  value={config.maxPerCallUsd}
                  onChange={(e) => setConfig((c) => ({ ...c, maxPerCallUsd: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white focus:outline-none focus:border-[#F4C430]/70"
                />
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-[#F4C430]/20">
                <label className="text-white font-medium text-sm block mb-1">Daily spending limit (USD)</label>
                <p className="text-[#A1A1A1] text-xs mb-3">Agent pauses and asks for approval when daily spend hits this.</p>
                <input
                  type="number" step="5" min="5"
                  value={config.dailyLimitUsd}
                  onChange={(e) => setConfig((c) => ({ ...c, dailyLimitUsd: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white focus:outline-none focus:border-[#F4C430]/70"
                />
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-[#F4C430]/20">
                <label className="text-white font-medium text-sm block mb-1">Require confirmation above (USD)</label>
                <p className="text-[#A1A1A1] text-xs mb-3">Agent must get explicit user approval for actions above this amount.</p>
                <input
                  type="number" step="5" min="1"
                  value={config.requireConfirmAboveUsd}
                  onChange={(e) => setConfig((c) => ({ ...c, requireConfirmAboveUsd: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[#F4C430]/30 text-white focus:outline-none focus:border-[#F4C430]/70"
                />
              </div>
            </div>

            {/* Summary card */}
            <div className="p-5 rounded-xl bg-[#F4C430]/5 border border-[#F4C430]/30">
              <h3 className="font-semibold mb-3 text-[#F4C430]">Launch Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#A1A1A1]">Template</span><span>{tmpl.icon} {tmpl.name}</span></div>
                <div className="flex justify-between"><span className="text-[#A1A1A1]">Agent Name</span><span>{config.name}</span></div>
                <div className="flex justify-between"><span className="text-[#A1A1A1]">LLM</span><span>{config.llmProvider} / {config.llmModel}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-[#A1A1A1] group relative cursor-help">
                    Price/call
                    <span className="absolute bottom-full left-0 mb-1.5 w-56 bg-[#1a1a1a] border border-white/10 text-white text-xs rounded-lg p-2.5 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 shadow-xl">
                      Amount buyers pay in USDC each time they hire your agent for a task. Goes into escrow — released to you after delivery.
                    </span>
                  </span>
                  <span>{config.price} {TOKEN_LIST.find(t => t.address === config.paymentToken)?.symbol ?? "USDm"}</span>
                </div>
                <div className="flex justify-between"><span className="text-[#A1A1A1]">ERC-8004 Identity</span><span className="text-green-400">Auto-minted</span></div>
                <div className="flex justify-between"><span className="text-[#A1A1A1]">Hosted Runtime</span><span className="text-green-400">OpenClaw</span></div>
              </div>
            </div>

            <p className="text-[#A1A1A1]/40 text-xs text-center">
              3 transactions required: mint identity NFT, register service, set agent URI.
            </p>

            <button
              onClick={handleDeploy}
              className="w-full py-4 rounded-xl gradient-btn font-bold text-lg hover:shadow-[0_0_25px_#F4C430] transition"
            >
              Deploy Agent ⚡
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Deploying ────────────────────────────────────────────────────────

  if (step === "deploying") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-[#F4C430]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-[#F4C430] border-t-transparent animate-spin" />
            <span className="absolute inset-0 flex items-center justify-center text-2xl">⚡</span>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Launching Agent</h2>
          <p className="text-[#A1A1A1] text-sm max-w-xs">{status}</p>
        </div>
      </div>
    );
  }

  // ─── Step: Done ─────────────────────────────────────────────────────────────

  if (step === "done") {
    const tmpl = TEMPLATES.find((t) => t.id === config.templateId)!;
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <div className="text-5xl mb-4 animate-bounce">{tmpl.icon}</div>
            <h1 className="text-3xl font-bold mb-2">Agent Live!</h1>
            <p className="text-[#A1A1A1]">
              <span className="text-[#F4C430] font-medium">{config.name}</span> is registered on Celo and hosted on OpenClaw.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/5 border border-[#F4C430]/30">
              <label className="text-[#A1A1A1] text-xs uppercase tracking-wider">Agent Wallet</label>
              <code className="text-[#F4C430] text-sm font-mono block mt-1 break-all">{deployedId}</code>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-lg font-bold text-[#F4C430]">{config.llmModel}</div>
                <div className="text-[#A1A1A1] text-xs mt-0.5">LLM</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-lg font-bold text-[#F4C430]">${config.dailyLimitUsd}</div>
                <div className="text-[#A1A1A1] text-xs mt-0.5">Daily limit</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-lg font-bold text-[#F4C430]">{config.price} USDC</div>
                <div className="text-[#A1A1A1] text-xs mt-0.5">Per call</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
              <h3 className="text-green-400 font-medium mb-2 text-sm">What happens next</h3>
              <ul className="text-[#A1A1A1] text-sm space-y-1">
                <li>• Your agent is listed on the Nastar marketplace</li>
                <li>• Other agents can hire it via on-chain escrow</li>
                <li>• You earn USDC every time it completes a job</li>
                <li>• Monitor activity from your dashboard</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={() => router.push(`/agents`)}
              className="flex-1 py-3 rounded-xl bg-white/5 text-[#F5F5F5] font-medium hover:bg-white/10 transition"
            >
              View Marketplace
            </button>
            <button
              onClick={() => router.push(`/launch/${deployedId}`)}
              className="flex-1 py-3 rounded-xl gradient-btn font-semibold hover:shadow-[0_0_15px_#F4C430] transition"
            >
              Open Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
