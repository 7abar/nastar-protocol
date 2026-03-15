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

const client = createPublicClient({ chain: celoSepoliaCustom, transport: http() });
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "trading",
    name: "Trading Bot",
    tagline: "DeFi automation on Celo",
    description: "Monitors markets and executes token swaps based on configurable thresholds.",
    tags: ["trading", "defi", "celo"],
    defaultOffering: {
      name: "token_swap",
      description: "Execute token swaps on Celo DEXes with configurable parameters",
      feeType: "percentage" as const,
      fee: "0.05",
      requiresFunds: true,
    },
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
    name: "Payment Agent",
    tagline: "Automate stablecoin payments",
    description: "Schedules and executes recurring stablecoin payments on behalf of users.",
    tags: ["payments", "usdc", "automation"],
    defaultOffering: {
      name: "scheduled_payment",
      description: "Process and schedule stablecoin payments",
      feeType: "fixed" as const,
      fee: "0.5",
      requiresFunds: true,
    },
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
    name: "Social Bot",
    tagline: "Onchain social actions",
    description: "Posts content, follows accounts, and engages on Farcaster and Lens on your behalf.",
    tags: ["social", "farcaster", "lens"],
    defaultOffering: {
      name: "social_engagement",
      description: "Post content and engage on Web3 social platforms",
      feeType: "fixed" as const,
      fee: "1",
      requiresFunds: false,
    },
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
    name: "Research Agent",
    tagline: "Onchain data intelligence",
    description: "Monitors wallets, contracts, and governance. Delivers daily digests.",
    tags: ["research", "analytics", "governance"],
    defaultOffering: {
      name: "blockchain_research",
      description: "Deep analysis of onchain data, wallets, and governance proposals",
      feeType: "fixed" as const,
      fee: "1.5",
      requiresFunds: false,
    },
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
    name: "Remittance Agent",
    tagline: "Cross-border transfers on Celo",
    description: "Understands natural language remittance requests and executes transfers using Mento stablecoins.",
    tags: ["remittance", "mento", "global-south", "payments"],
    defaultOffering: {
      name: "cross_border_transfer",
      description: "Execute cross-border remittances using Mento stablecoins at <0.5% fees",
      feeType: "percentage" as const,
      fee: "0.005",
      requiresFunds: true,
    },
    systemPrompt: `You are a cross-border remittance agent on Celo. Your job is to:
- Parse natural language transfer requests like "Send $50 to my mom in the Philippines"
- Find the cheapest route using Mento pools (USD→PHP, EUR→NGN, GBP→KES)
- Execute stablecoin swaps (USDm, EURm, BRLm, COPm, XOFm) via Mento Protocol
- Show fee comparisons vs traditional providers (Western Union: ~7%, Wise: ~1.5%, Nastar: <0.5%)
- Schedule recurring transfers when requested

Never send to unverified addresses. Always confirm amounts before executing.`,
  },
  {
    id: "fx-hedge",
    name: "FX Hedging Agent",
    tagline: "Automated currency hedging",
    description: "Monitors multi-currency exposure and auto-rebalances using Mento stablecoins.",
    tags: ["fx", "hedging", "mento", "defi", "treasury"],
    defaultOffering: {
      name: "fx_rebalance",
      description: "Monitor and rebalance multi-currency stablecoin portfolios",
      feeType: "percentage" as const,
      fee: "0.02",
      requiresFunds: true,
    },
    systemPrompt: `You are an FX hedging agent on Celo. Your job is to:
- Track portfolio exposure across multiple Celo stablecoins (USDm, EURm, BRLm, COPm, XOFm)
- Monitor drift from user-configured target allocations
- Execute rebalancing swaps via Mento Protocol when drift exceeds threshold
- Optimize swap timing to minimize slippage and gas costs
- Generate daily risk reports showing currency movements and hedging costs

Example allocation: "Keep 50% in USDm, 30% in EURm, 20% in BRLm"
Rebalance when any position drifts more than 5% from target.`,
  },
  {
    id: "custom",
    name: "Custom Agent",
    tagline: "Build your own",
    description: "Blank slate -- write your own system prompt and configure everything from scratch.",
    tags: ["custom"],
    defaultOffering: {
      name: "custom_service",
      description: "",
      feeType: "fixed" as const,
      fee: "1",
      requiresFunds: false,
    },
    systemPrompt: "",
  },
];

const LLM_PROVIDERS = [
  { id: "openai", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  { id: "anthropic", name: "Anthropic", models: ["claude-sonnet-4-5", "claude-haiku-3-5"] },
  { id: "google", name: "Google", models: ["gemini-2.0-flash", "gemini-1.5-pro"] },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "template" | "agent" | "offerings" | "llm" | "review" | "deploying" | "done";

interface Offering {
  name: string;
  description: string;
  feeType: "fixed" | "percentage";
  fee: string;
  requiresFunds: boolean;
  paymentToken: `0x${string}`;
}

interface AgentConfig {
  templateId: string;
  // Agent profile
  name: string;
  description: string;
  systemPrompt: string;
  avatarPreview: string;
  tags: string;
  // Offerings
  offerings: Offering[];
  // LLM
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  // Limits
  maxPerCallUsd: string;
  dailyLimitUsd: string;
  requireConfirmAboveUsd: string;
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
  const [editingOffering, setEditingOffering] = useState<number | null>(null);

  const [config, setConfig] = useState<AgentConfig>({
    templateId: "",
    name: "",
    description: "",
    systemPrompt: "",
    avatarPreview: "",
    tags: "",
    offerings: [],
    llmProvider: "openai",
    llmModel: "gpt-4o-mini",
    llmApiKey: "",
    maxPerCallUsd: "10",
    dailyLimitUsd: "50",
    requireConfirmAboveUsd: "25",
  });

  function selectTemplate(t: typeof TEMPLATES[0]) {
    setConfig((c) => ({
      ...c,
      templateId: t.id,
      name: t.id === "custom" ? "" : t.name,
      description: t.id === "custom" ? "" : t.description,
      systemPrompt: t.systemPrompt,
      tags: t.tags.join(", "),
      offerings: [{
        ...t.defaultOffering,
        paymentToken: CELO_TOKENS.USDm,
      }],
    }));
    setStep("agent");
  }

  const selectedProvider = LLM_PROVIDERS.find((p) => p.id === config.llmProvider)!;

  // New blank offering
  function addOffering() {
    setConfig((c) => ({
      ...c,
      offerings: [...c.offerings, {
        name: "",
        description: "",
        feeType: "fixed",
        fee: "1",
        requiresFunds: false,
        paymentToken: CELO_TOKENS.USDm,
      }],
    }));
    setEditingOffering(config.offerings.length);
  }

  function updateOffering(idx: number, patch: Partial<Offering>) {
    setConfig((c) => ({
      ...c,
      offerings: c.offerings.map((o, i) => i === idx ? { ...o, ...patch } : o),
    }));
  }

  function removeOffering(idx: number) {
    setConfig((c) => ({
      ...c,
      offerings: c.offerings.filter((_, i) => i !== idx),
    }));
    setEditingOffering(null);
  }

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
          const owner = await client.readContract({
            address: CONTRACTS.IDENTITY_REGISTRY,
            abi: [{ type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }], stateMutability: "view" }] as const,
            functionName: "ownerOf",
            args: [i],
          });
          if ((owner as string).toLowerCase() === ownerAddress.toLowerCase()) {
            agentNftId = Number(i);
            break;
          }
        } catch { continue; }
      }

      // 3. Register first offering as service on-chain
      const primaryOffering = config.offerings[0];
      const feeForChain = BigInt(Math.floor(parseFloat(primaryOffering.fee) * 1e18));
      const tagList = config.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      setStatus("Registering service on-chain...");
      const registerServiceData = encodeFunctionData({
        abi: SERVICE_REGISTRY_ABI,
        functionName: "registerService",
        args: [
          BigInt(agentNftId ?? 0),         // agentId
          config.name,                      // name
          primaryOffering.description,      // description
          `${API_URL}/api/agent/endpoint`,  // endpoint
          primaryOffering.paymentToken,     // paymentToken
          feeForChain,                      // pricePerCall
          tagList,                          // tags
        ],
      });
      const svcHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: ownerAddress, to: CONTRACTS.SERVICE_REGISTRY, data: registerServiceData }],
      });
      await client.waitForTransactionReceipt({ hash: svcHash as `0x${string}` });

      // 4. Store agent config
      setStatus("Storing agent configuration...");
      const apiKey = generateApiKey();
      await storeAgent({
        id: agentWallet.address,
        name: config.name,
        description: config.description,
        ownerAddress,
        agentWallet: agentWallet.address,
        agentPrivateKey: "",
        apiKey,
        apiKeyActive: true,
        agentNftId: agentNftId,
        serviceId: null,
        endpoint: `${API_URL}/api/agent/endpoint`,
        tags: tagList,
        pricePerCall: primaryOffering.fee,
        paymentToken: primaryOffering.paymentToken,
        avatar: config.avatarPreview || null,
        createdAt: Date.now(),
      });

      // 5. Set token URI
      if (agentNftId !== null) {
        setStatus("Setting agent metadata URI...");
        try {
          const setUriData = encodeFunctionData({
            abi: ERC8004_ABI,
            functionName: "setAgentURI",
            args: [BigInt(agentNftId), `${API_URL}/api/agent/${agentNftId}/metadata`],
          });
          const uriHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{ from: ownerAddress, to: CONTRACTS.IDENTITY_REGISTRY, data: setUriData }],
          });
          await client.waitForTransactionReceipt({ hash: uriHash as `0x${string}` });
        } catch { /* non-critical */ }
      }

      setDeployedId(agentWallet.address);
      setStep("done");
    } catch (err: any) {
      setError(err?.message?.slice(0, 200) || "Deploy failed");
      setStep("review");
    }
  }

  // ─── Step: Template Selection ───────────────────────────────────────────────

  if (step === "template") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">Launch an Agent</h1>
            <p className="text-[#A1A1A1]/60 text-sm">Choose a template or start from scratch. You can customize everything.</p>
          </div>

          {!authenticated && (
            <button onClick={login} className="w-full py-3 mb-6 rounded-xl gradient-btn font-semibold">
              Connect Wallet to Continue
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => authenticated && selectTemplate(t)}
                disabled={!authenticated}
                className="p-5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/30 transition text-left group disabled:opacity-50"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-[#F5F5F5] group-hover:text-[#F4C430] transition">{t.name}</h3>
                  <span className="text-[#A1A1A1]/30 text-xs">{t.defaultOffering.feeType === "fixed" ? `$${t.defaultOffering.fee}` : `${(parseFloat(t.defaultOffering.fee) * 100).toFixed(1)}%`}</span>
                </div>
                <p className="text-[#A1A1A1]/50 text-xs leading-relaxed mb-3">{t.tagline}</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[#A1A1A1]/40 text-[10px]">{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Agent Profile ────────────────────────────────────────────────────

  if (step === "agent") {
    const tmpl = TEMPLATES.find((t) => t.id === config.templateId)!;
    return (
      <div className="bg-[#0A0A0A] text-[#F5F5F5] min-h-screen">
        <div className="max-w-xl mx-auto px-4 py-10">

          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("template")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Agent Profile</h1>
              <p className="text-[#A1A1A1]/50 text-xs">Step 1 of 4 -- Who is your agent?</p>
            </div>
          </div>

          <div className="space-y-6">

            {/* Avatar + Name row */}
            <div className="flex items-start gap-4">
              <div
                onClick={() => document.getElementById("agent-avatar-input")?.click()}
                className="w-20 h-20 rounded-2xl bg-white/[0.03] border-2 border-dashed border-white/[0.1] hover:border-[#F4C430]/40 transition cursor-pointer flex items-center justify-center overflow-hidden group shrink-0"
              >
                {config.avatarPreview ? (
                  <img src={config.avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-7 h-7 text-[#A1A1A1]/20 group-hover:text-[#F4C430]/60 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                )}
              </div>
              <input id="agent-avatar-input" type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) { alert("Max 2MB"); return; }
                  const reader = new FileReader();
                  reader.onload = () => setConfig((c) => ({ ...c, avatarPreview: reader.result as string }));
                  reader.readAsDataURL(file);
                }}
              />
              <div className="flex-1 space-y-1">
                <label className="text-[#A1A1A1]/60 text-xs">Agent Name *</label>
                <input
                  value={config.name}
                  onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
                  placeholder={`e.g. ${tmpl.name}`}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
                />
                <p className="text-[#A1A1A1]/30 text-[10px]">Click image to upload avatar</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-[#A1A1A1]/60 text-xs mb-1.5 block">Description *</label>
              <textarea
                value={config.description}
                onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
                placeholder="What does this agent do? This is shown in the marketplace."
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm resize-none transition"
              />
            </div>

            {/* System Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[#A1A1A1]/60 text-xs">System Prompt *</label>
                <span className="text-[10px] text-[#A1A1A1]/30">Pre-filled from template</span>
              </div>
              <textarea
                value={config.systemPrompt}
                onChange={(e) => setConfig((c) => ({ ...c, systemPrompt: e.target.value }))}
                placeholder="Define how your agent thinks and behaves..."
                rows={6}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm resize-none font-mono transition"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="text-[#A1A1A1]/60 text-xs mb-1.5 block">Tags</label>
              <input
                value={config.tags}
                onChange={(e) => setConfig((c) => ({ ...c, tags: e.target.value }))}
                placeholder="e.g. trading, defi, celo"
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
              />
              <p className="text-[#A1A1A1]/30 text-[10px] mt-1">Comma-separated. Helps buyers discover your agent.</p>
            </div>

            <button
              onClick={() => setStep("offerings")}
              disabled={!config.name.trim() || !config.systemPrompt.trim()}
              className="w-full py-3.5 rounded-xl gradient-btn font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(244,196,48,0.3)] transition mt-2"
            >
              Next: Configure Offerings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Offerings ────────────────────────────────────────────────────────

  if (step === "offerings") {
    return (
      <div className="bg-[#0A0A0A] text-[#F5F5F5] min-h-screen">
        <div className="max-w-xl mx-auto px-4 py-10">

          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("agent")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Service Offerings</h1>
              <p className="text-[#A1A1A1]/50 text-xs">Step 2 of 4 -- What does your agent sell?</p>
            </div>
          </div>

          {/* ACP-style explainer */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-6">
            <p className="text-[#A1A1A1]/50 text-xs leading-relaxed">
              Each offering is a service your agent provides. Set a <span className="text-[#F5F5F5]">fixed fee</span> (flat rate per job) or <span className="text-[#F5F5F5]">percentage</span> (commission on funds handled). Agents can have multiple offerings.
            </p>
          </div>

          {/* Offering list */}
          <div className="space-y-3 mb-4">
            {config.offerings.map((offering, idx) => (
              <div key={idx} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                {/* Offering header (collapsed) */}
                <button
                  onClick={() => setEditingOffering(editingOffering === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#F4C430]/10 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-[#F4C430]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium truncate">{offering.name || "Untitled offering"}</p>
                      <p className="text-[#A1A1A1]/40 text-[10px]">
                        {offering.feeType === "fixed"
                          ? `$${offering.fee} flat fee`
                          : `${(parseFloat(offering.fee || "0") * 100).toFixed(1)}% commission`
                        }
                        {offering.requiresFunds && " + funds transfer"}
                      </p>
                    </div>
                  </div>
                  <svg className={`w-4 h-4 text-[#A1A1A1]/40 transition ${editingOffering === idx ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded edit form */}
                {editingOffering === idx && (
                  <div className="px-4 pb-4 pt-1 space-y-4 border-t border-white/[0.06]">

                    {/* Offering name */}
                    <div>
                      <label className="text-[#A1A1A1]/60 text-xs mb-1 block">Offering Name *</label>
                      <input
                        value={offering.name}
                        onChange={(e) => updateOffering(idx, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                        placeholder="e.g. token_swap"
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm font-mono transition"
                      />
                      <p className="text-[#A1A1A1]/25 text-[10px] mt-0.5">Lowercase, underscores only</p>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-[#A1A1A1]/60 text-xs mb-1 block">Description *</label>
                      <textarea
                        value={offering.description}
                        onChange={(e) => updateOffering(idx, { description: e.target.value })}
                        placeholder="What does this offering do for the buyer?"
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm resize-none transition"
                      />
                    </div>

                    {/* Fee type toggle */}
                    <div>
                      <label className="text-[#A1A1A1]/60 text-xs mb-2 block">Fee Model</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateOffering(idx, { feeType: "fixed" })}
                          className={`p-3 rounded-xl border text-left transition ${
                            offering.feeType === "fixed"
                              ? "border-[#F4C430]/40 bg-[#F4C430]/5"
                              : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                          }`}
                        >
                          <p className={`text-sm font-medium ${offering.feeType === "fixed" ? "text-[#F4C430]" : "text-[#F5F5F5]"}`}>Fixed Fee</p>
                          <p className="text-[#A1A1A1]/40 text-[10px] mt-0.5">Flat rate per job</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateOffering(idx, { feeType: "percentage", requiresFunds: true })}
                          className={`p-3 rounded-xl border text-left transition ${
                            offering.feeType === "percentage"
                              ? "border-[#F4C430]/40 bg-[#F4C430]/5"
                              : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                          }`}
                        >
                          <p className={`text-sm font-medium ${offering.feeType === "percentage" ? "text-[#F4C430]" : "text-[#F5F5F5]"}`}>Percentage</p>
                          <p className="text-[#A1A1A1]/40 text-[10px] mt-0.5">Commission on capital</p>
                        </button>
                      </div>
                    </div>

                    {/* Fee amount */}
                    <div>
                      <label className="text-[#A1A1A1]/60 text-xs mb-1 block">
                        {offering.feeType === "fixed" ? "Fee Amount (USD)" : "Commission Rate"}
                      </label>
                      <div className="flex gap-2 items-center">
                        {offering.feeType === "percentage" && <span className="text-[#A1A1A1]/50 text-sm shrink-0">%</span>}
                        <input
                          value={offering.feeType === "percentage" ? String(parseFloat(offering.fee || "0") * 100) : offering.fee}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (offering.feeType === "percentage") {
                              updateOffering(idx, { fee: String(parseFloat(val || "0") / 100) });
                            } else {
                              updateOffering(idx, { fee: val });
                            }
                          }}
                          type="number" step={offering.feeType === "fixed" ? "0.01" : "0.1"} min="0"
                          placeholder={offering.feeType === "fixed" ? "5.00" : "5"}
                          className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
                        />
                        {offering.feeType === "fixed" && (
                          <select
                            value={offering.paymentToken}
                            onChange={(e) => updateOffering(idx, { paymentToken: e.target.value as `0x${string}` })}
                            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
                          >
                            {TOKEN_LIST.map((t) => (
                              <option key={t.address} value={t.address} className="bg-[#111]">
                                {t.flag} {t.symbol}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <p className="text-[#A1A1A1]/25 text-[10px] mt-1">
                        {offering.feeType === "fixed"
                          ? "Amount buyers pay per job. Goes into escrow."
                          : "Percentage taken from the capital the buyer sends (e.g. 5 = 5%)."
                        }
                      </p>
                    </div>

                    {/* Remove offering */}
                    {config.offerings.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOffering(idx)}
                        className="text-red-400/50 text-xs hover:text-red-400 transition"
                      >
                        Remove this offering
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add offering */}
          <button
            type="button"
            onClick={addOffering}
            className="w-full py-3 rounded-xl border border-dashed border-white/[0.1] text-[#A1A1A1]/50 text-sm hover:border-[#F4C430]/30 hover:text-[#F4C430] transition flex items-center justify-center gap-2 mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add another offering
          </button>

          <button
            onClick={() => setStep("llm")}
            disabled={config.offerings.length === 0 || !config.offerings[0].name || !config.offerings[0].description}
            className="w-full py-3.5 rounded-xl gradient-btn font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(244,196,48,0.3)] transition"
          >
            Next: LLM Backend
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: LLM ──────────────────────────────────────────────────────────────

  if (step === "llm") {
    const useOwnKey = config.llmProvider !== "platform";
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("offerings")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">AI Model</h1>
              <p className="text-[#A1A1A1]/50 text-xs">Step 3 of 4 -- Choose how your agent thinks</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Platform vs Own Key toggle */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfig((c) => ({ ...c, llmProvider: "platform", llmModel: "gpt-4o-mini", llmApiKey: "" }))}
                className={`p-4 rounded-xl border text-left transition ${
                  !useOwnKey
                    ? "border-[#F4C430]/40 bg-[#F4C430]/5"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                }`}
              >
                <p className={`text-sm font-medium ${!useOwnKey ? "text-[#F4C430]" : "text-[#F5F5F5]"}`}>Nastar Models</p>
                <p className="text-[#A1A1A1]/40 text-[10px] mt-0.5">Free -- powered by the platform</p>
              </button>
              <button
                onClick={() => setConfig((c) => ({ ...c, llmProvider: "openai", llmModel: "gpt-4o-mini" }))}
                className={`p-4 rounded-xl border text-left transition ${
                  useOwnKey
                    ? "border-[#F4C430]/40 bg-[#F4C430]/5"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                }`}
              >
                <p className={`text-sm font-medium ${useOwnKey ? "text-[#F4C430]" : "text-[#F5F5F5]"}`}>Bring Your Key</p>
                <p className="text-[#A1A1A1]/40 text-[10px] mt-0.5">Use your own OpenAI / Anthropic / Google key</p>
              </button>
            </div>

            {/* Platform model picker */}
            {!useOwnKey && (
              <div>
                <label className="text-[#A1A1A1]/60 text-xs mb-2 block">Model</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Fast & cheap" },
                    { id: "gpt-4o", label: "GPT-4o", desc: "Smartest" },
                    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "Google's fastest" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setConfig((c) => ({ ...c, llmModel: m.id }))}
                      className={`py-3 px-4 rounded-xl border text-left transition ${
                        config.llmModel === m.id
                          ? "border-[#F4C430]/40 bg-[#F4C430]/5"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
                      }`}
                    >
                      <p className={`text-sm font-mono ${config.llmModel === m.id ? "text-[#F4C430]" : "text-[#F5F5F5]"}`}>{m.label}</p>
                      <p className="text-[#A1A1A1]/30 text-[10px]">{m.desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[#A1A1A1]/25 text-[10px] mt-2">No API key needed. Nastar handles the LLM infrastructure.</p>
              </div>
            )}

            {/* Own key config */}
            {useOwnKey && (
              <>
                <div>
                  <label className="text-[#A1A1A1]/60 text-xs mb-2 block">Provider</label>
                  <div className="grid grid-cols-3 gap-3">
                    {LLM_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setConfig((c) => ({ ...c, llmProvider: p.id, llmModel: p.models[0] }))}
                        className={`py-3 rounded-xl border font-medium transition text-sm ${
                          config.llmProvider === p.id
                            ? "border-[#F4C430]/40 bg-[#F4C430]/5 text-[#F4C430]"
                            : "border-white/[0.08] bg-white/[0.02] text-[#A1A1A1] hover:border-white/[0.15]"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[#A1A1A1]/60 text-xs mb-2 block">Model</label>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedProvider.models.map((m) => (
                      <button
                        key={m}
                        onClick={() => setConfig((c) => ({ ...c, llmModel: m }))}
                        className={`py-2.5 px-4 rounded-xl border font-mono text-sm transition ${
                          config.llmModel === m
                            ? "border-[#F4C430]/40 bg-[#F4C430]/5 text-[#F4C430]"
                            : "border-white/[0.08] bg-white/[0.02] text-[#A1A1A1] hover:border-white/[0.15]"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[#A1A1A1]/60 text-xs mb-1 block">
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
                            className={`w-full px-3 py-2.5 pr-10 rounded-xl bg-white/[0.04] border text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none font-mono text-sm transition ${
                              key.length === 0 ? "border-white/[0.08] focus:border-[#F4C430]/40" :
                              valid ? "border-green-400/30 focus:border-green-400/60" :
                              "border-red-400/30 focus:border-red-400/60"
                            }`}
                          />
                          {key.length > 0 && (
                            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm ${valid ? "text-green-400" : "text-red-400"}`}>
                              {valid ? "Valid" : "Invalid"}
                            </span>
                          )}
                        </div>
                        <p className="text-[#A1A1A1]/30 text-[10px] mt-1">
                          {config.llmProvider === "openai" && "Get yours at platform.openai.com/api-keys"}
                          {config.llmProvider === "anthropic" && "Get yours at console.anthropic.com/settings/keys"}
                          {config.llmProvider === "google" && "Get yours at aistudio.google.com/app/apikey"}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {(() => {
              if (!useOwnKey) {
                return (
                  <button
                    onClick={() => setStep("review")}
                    className="w-full py-3.5 rounded-xl gradient-btn font-semibold text-sm hover:shadow-[0_0_20px_rgba(244,196,48,0.3)] transition"
                  >
                    Next: Review & Deploy
                  </button>
                );
              }
              const key = config.llmApiKey.trim();
              const valid =
                config.llmProvider === "openai" ? /^sk-[A-Za-z0-9_-]{20,}$/.test(key) :
                config.llmProvider === "anthropic" ? /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key) :
                config.llmProvider === "google" ? /^AIza[A-Za-z0-9_-]{30,}$/.test(key) :
                key.length > 10;
              return (
                <button
                  onClick={() => setStep("review")}
                  disabled={!valid}
                  className="w-full py-3.5 rounded-xl gradient-btn font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(244,196,48,0.3)] transition"
                >
                  Next: Review & Deploy
                </button>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Review & Deploy ──────────────────────────────────────────────────

  if (step === "review") {
    const tmpl = TEMPLATES.find((t) => t.id === config.templateId)!;
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-xl mx-auto px-4 py-10">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("llm")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Review & Deploy</h1>
              <p className="text-[#A1A1A1]/50 text-xs">Step 4 of 4 -- Confirm and launch</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Agent summary */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-center gap-3 mb-3">
                {config.avatarPreview ? (
                  <img src={config.avatarPreview} alt="" className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#F4C430]/10 flex items-center justify-center text-[#F4C430] text-lg">A</div>
                )}
                <div>
                  <p className="font-semibold">{config.name}</p>
                  <p className="text-[#A1A1A1]/50 text-xs">{config.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {config.tags.split(",").filter(Boolean).map((t) => (
                  <span key={t.trim()} className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[#A1A1A1]/40 text-[10px]">{t.trim()}</span>
                ))}
              </div>
            </div>

            {/* Offerings summary */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <p className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mb-3">Offerings ({config.offerings.length})</p>
              <div className="space-y-2">
                {config.offerings.map((o, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-mono">{o.name}</p>
                      <p className="text-[#A1A1A1]/40 text-[10px] truncate">{o.description}</p>
                    </div>
                    <span className="text-[#F4C430] text-xs font-medium shrink-0 ml-3">
                      {o.feeType === "fixed"
                        ? `$${o.fee}`
                        : `${(parseFloat(o.fee) * 100).toFixed(1)}%`
                      }
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* LLM summary */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <p className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mb-3">Configuration</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#A1A1A1]/50">LLM</span><span className="font-mono text-xs">{config.llmProvider === "platform" ? "Nastar" : config.llmProvider} / {config.llmModel}</span></div>
                <div className="flex justify-between"><span className="text-[#A1A1A1]/50">ERC-8004 Identity</span><span className="text-green-400 text-xs">Auto-minted</span></div>
                <div className="flex justify-between"><span className="text-[#A1A1A1]/50">Hosted Runtime</span><span className="text-green-400 text-xs">OpenClaw</span></div>
              </div>
            </div>

            {/* Spending limits */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <p className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider mb-3">Spending Limits</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[#A1A1A1]/40 text-[10px] block mb-1">Max per op</label>
                  <input
                    type="number" min="1" value={config.maxPerCallUsd}
                    onChange={(e) => setConfig((c) => ({ ...c, maxPerCallUsd: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#F4C430]/40 transition"
                  />
                </div>
                <div>
                  <label className="text-[#A1A1A1]/40 text-[10px] block mb-1">Daily limit</label>
                  <input
                    type="number" min="5" value={config.dailyLimitUsd}
                    onChange={(e) => setConfig((c) => ({ ...c, dailyLimitUsd: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#F4C430]/40 transition"
                  />
                </div>
                <div>
                  <label className="text-[#A1A1A1]/40 text-[10px] block mb-1">Confirm above</label>
                  <input
                    type="number" min="1" value={config.requireConfirmAboveUsd}
                    onChange={(e) => setConfig((c) => ({ ...c, requireConfirmAboveUsd: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#F4C430]/40 transition"
                  />
                </div>
              </div>
            </div>

            <p className="text-[#A1A1A1]/30 text-[10px] text-center">
              3 transactions required: mint identity NFT, register service, set metadata URI.
            </p>

            <button
              onClick={handleDeploy}
              className="w-full py-4 rounded-xl gradient-btn font-bold text-base hover:shadow-[0_0_25px_rgba(244,196,48,0.3)] transition"
            >
              Deploy Agent
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
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Deploying Agent</h2>
          <p className="text-[#A1A1A1]/60 text-sm max-w-xs">{status}</p>
        </div>
      </div>
    );
  }

  // ─── Step: Done ─────────────────────────────────────────────────────────────

  if (step === "done") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
        <div className="max-w-xl mx-auto px-4 py-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-1">Agent Live</h1>
            <p className="text-[#A1A1A1]/60 text-sm">
              <span className="text-[#F4C430]">{config.name}</span> is registered on Celo and ready to serve.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <label className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider">Agent Wallet</label>
              <code className="text-[#F4C430] text-sm font-mono block mt-1 break-all">{deployedId}</code>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div className="text-sm font-bold text-[#F4C430]">{config.offerings.length}</div>
                <div className="text-[#A1A1A1]/40 text-[10px] mt-0.5">Offerings</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div className="text-sm font-bold text-[#F4C430] font-mono">{config.llmModel}</div>
                <div className="text-[#A1A1A1]/40 text-[10px] mt-0.5">LLM</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div className="text-sm font-bold text-[#F4C430]">${config.dailyLimitUsd}</div>
                <div className="text-[#A1A1A1]/40 text-[10px] mt-0.5">Daily limit</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
              <h3 className="text-green-400 font-medium mb-2 text-xs">What happens next</h3>
              <ul className="text-[#A1A1A1]/60 text-xs space-y-1">
                <li>Your agent is listed on the Nastar marketplace</li>
                <li>Other agents and users can hire it via on-chain escrow</li>
                <li>You earn fees every time it completes a job</li>
                <li>Monitor activity from your profile</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => router.push("/offerings")}
              className="flex-1 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] font-medium text-sm hover:bg-white/[0.08] transition"
            >
              Browse Marketplace
            </button>
            <button
              onClick={() => router.push(`/launch/${deployedId}`)}
              className="flex-1 py-3 rounded-xl gradient-btn font-semibold text-sm hover:shadow-[0_0_20px_rgba(244,196,48,0.3)] transition"
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
