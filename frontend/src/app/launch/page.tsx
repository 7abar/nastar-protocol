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
import { supabase } from "@/lib/supabase";
import PageTitle from "@/components/PageTitle";

const client = createPublicClient({ chain: celoSepoliaCustom, transport: http() });
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "trading",
    name: "Trading Bot",
    tagline: "DeFi automation on Celo",
    description: "Executes token swaps, monitors prices, and manages DeFi positions across Celo DEXes.",
    tags: ["trading", "defi", "celo", "mento"],
    defaultOfferings: [
      { name: "Token Swap", description: "Execute token swaps on Celo DEXes (Ubeswap, Mento) with slippage protection", feeType: "percentage" as const, fee: "0.05", requiresFunds: true },
      { name: "Price Alert", description: "Monitor token prices and notify when thresholds are hit (e.g. cUSD/USDC depeg)", feeType: "fixed" as const, fee: "0.25", requiresFunds: false },
      { name: "Portfolio Rebalance", description: "Auto-rebalance a multi-token portfolio to target allocations", feeType: "percentage" as const, fee: "0.03", requiresFunds: true },
      { name: "DCA Strategy", description: "Dollar-cost average into a token with scheduled recurring buys", feeType: "percentage" as const, fee: "0.02", requiresFunds: true },
    ],
    systemPrompt: `You are a DeFi trading agent on Celo. You execute real trades using your agent wallet.
- Execute swaps via [ACTION:swap:AMOUNT:FROM:TO] when user requests
- Check balances via [ACTION:balance:ADDRESS]
- Monitor prices using live FX rates provided in context
- Always confirm trade details before executing above $50
- Report every action with amounts, rates, and transaction hashes
- Be conservative — protect the user's capital above all else`,
  },
  {
    id: "payments",
    name: "Payment Agent",
    tagline: "Automate stablecoin payments",
    description: "Sends payments, processes invoices, and manages recurring transfers in 16+ stablecoins.",
    tags: ["payments", "stablecoin", "automation", "invoicing"],
    defaultOfferings: [
      { name: "Send Payment", description: "Send stablecoin payments to any Celo address with receipt generation", feeType: "fixed" as const, fee: "0.25", requiresFunds: true },
      { name: "Batch Payroll", description: "Process multiple payments in one batch (up to 20 recipients)", feeType: "fixed" as const, fee: "1", requiresFunds: true },
      { name: "Invoice Processing", description: "Parse invoice details and execute payment with proof-of-payment", feeType: "fixed" as const, fee: "0.5", requiresFunds: true },
      { name: "Recurring Transfer", description: "Schedule daily/weekly/monthly automatic stablecoin transfers", feeType: "fixed" as const, fee: "0.5", requiresFunds: true },
    ],
    systemPrompt: `You are a payment automation agent on Celo. You execute real transfers using your agent wallet.
- Send payments via [ACTION:send:AMOUNT:TOKEN:ADDRESS]
- Check balances via [ACTION:balance:ADDRESS]
- Always verify recipient address before sending
- Generate payment receipts with TX hash, amount, timestamp
- Enforce daily spending limits — never exceed without explicit confirmation
- Support all Celo stablecoins: cUSD, USDC, USDT, EURm, and more`,
  },
  {
    id: "social",
    name: "Content Agent",
    tagline: "AI-powered content creation",
    description: "Creates Web3 content, manages social strategy, and generates engagement reports.",
    tags: ["content", "social", "marketing", "web3"],
    defaultOfferings: [
      { name: "Thread Writer", description: "Write a Twitter/Farcaster thread on any Web3 topic (5-10 posts)", feeType: "fixed" as const, fee: "1", requiresFunds: false },
      { name: "Content Calendar", description: "Generate a 7-day content calendar with posts, hooks, and hashtags", feeType: "fixed" as const, fee: "2", requiresFunds: false },
      { name: "Community Report", description: "Analyze a project's community health, sentiment, and growth metrics", feeType: "fixed" as const, fee: "1.5", requiresFunds: false },
      { name: "Brand Voice Kit", description: "Create a brand voice guide with tone, vocabulary, and example posts", feeType: "fixed" as const, fee: "3", requiresFunds: false },
    ],
    systemPrompt: `You are a Web3 content creation agent. You deliver actual content — not descriptions of content.
- When asked for threads: write the actual thread posts, numbered, ready to copy-paste
- When asked for calendars: deliver a structured day-by-day plan with actual post drafts
- When asked for reports: analyze and deliver real data-driven insights
- Write in the user's preferred tone (casual, professional, degen, etc.)
- Every delivery should be immediately usable — no placeholders or "insert here"
- End each delivery with "Delivery complete. This output has been recorded as proof-of-work."`,
  },
  {
    id: "research",
    name: "Research Agent",
    tagline: "Onchain data intelligence",
    description: "Analyzes wallets, governance proposals, and market trends. Delivers actionable reports.",
    tags: ["research", "analytics", "governance", "data"],
    defaultOfferings: [
      { name: "Wallet Analysis", description: "Deep analysis of any wallet — holdings, transaction patterns, DeFi positions", feeType: "fixed" as const, fee: "1", requiresFunds: false },
      { name: "Governance Brief", description: "Summarize and analyze active Celo governance proposals with voting recommendations", feeType: "fixed" as const, fee: "1.5", requiresFunds: false },
      { name: "Market Report", description: "Weekly market report covering Celo ecosystem trends, TVL, and token movements", feeType: "fixed" as const, fee: "2", requiresFunds: false },
      { name: "Smart Contract Audit", description: "Review a smart contract for common vulnerabilities and gas optimization", feeType: "fixed" as const, fee: "5", requiresFunds: false },
    ],
    systemPrompt: `You are a blockchain research agent on Celo. You deliver real analysis with real data.
- Check wallet balances via [ACTION:balance:ADDRESS]
- Use live FX rates and on-chain data from context to provide real numbers
- Cite sources: transaction hashes, block numbers, contract addresses
- Flag uncertainty — never present speculation as fact
- Structure reports with clear sections: Summary, Key Findings, Data, Recommendations
- Deliver complete reports, not outlines or promises to research later`,
  },
  {
    id: "remittance",
    name: "Remittance Agent",
    tagline: "Cross-border transfers on Celo",
    description: "Converts and sends money globally using Mento stablecoins. Cheaper than Western Union.",
    tags: ["remittance", "mento", "global-south", "cross-border"],
    defaultOfferings: [
      { name: "Send Remittance", description: "Convert and send money cross-border via Mento (e.g. USD→KES, EUR→NGN)", feeType: "percentage" as const, fee: "0.005", requiresFunds: true },
      { name: "Rate Quote", description: "Get live FX rate quotes for any Mento currency pair with fee comparison", feeType: "fixed" as const, fee: "0", requiresFunds: false },
      { name: "Recurring Remittance", description: "Schedule weekly/monthly cross-border transfers (e.g. $50/month to Philippines)", feeType: "percentage" as const, fee: "0.005", requiresFunds: true },
      { name: "Multi-Recipient", description: "Send remittances to multiple recipients in different countries in one batch", feeType: "percentage" as const, fee: "0.008", requiresFunds: true },
    ],
    systemPrompt: `You are a cross-border remittance agent on Celo. You execute real transfers using Mento stablecoins.
- Execute swaps via [ACTION:swap:AMOUNT:FROM:TO] (e.g. cUSD→KESm for Kenya)
- Send funds via [ACTION:send:AMOUNT:TOKEN:ADDRESS]
- Use live FX rates from context to show real conversion amounts
- Always compare fees: Western Union ~7%, Wise ~1.5%, Nastar <0.5%
- Parse natural language: "Send $50 to my mom in Kenya" → swap cUSD→KESm, send KESm
- Available corridors: USD, EUR, GBP, BRL, COP, KES, NGN, GHS, ZAR, XOF, PHP, AUD, CAD, CHF, JPY`,
  },
  {
    id: "fx-hedge",
    name: "FX Hedging Agent",
    tagline: "Automated currency hedging",
    description: "Manages multi-currency exposure and auto-rebalances portfolios using Mento stablecoins.",
    tags: ["fx", "hedging", "mento", "treasury", "risk"],
    defaultOfferings: [
      { name: "Portfolio Rebalance", description: "Rebalance multi-currency stablecoin portfolio to target allocations", feeType: "percentage" as const, fee: "0.02", requiresFunds: true },
      { name: "Exposure Report", description: "Analyze current currency exposure with drift and risk metrics", feeType: "fixed" as const, fee: "1", requiresFunds: false },
      { name: "Hedge Strategy", description: "Design a hedging strategy based on your business's currency risk profile", feeType: "fixed" as const, fee: "3", requiresFunds: false },
      { name: "Auto-Hedge", description: "Continuous monitoring — auto-rebalance when drift exceeds threshold (e.g. 5%)", feeType: "percentage" as const, fee: "0.03", requiresFunds: true },
    ],
    systemPrompt: `You are an FX hedging agent on Celo. You manage real multi-currency portfolios using Mento stablecoins.
- Execute rebalancing swaps via [ACTION:swap:AMOUNT:FROM:TO]
- Check positions via [ACTION:balance:ADDRESS]
- Use live FX rates to calculate drift and exposure
- Track allocation targets (e.g. "50% USDm, 30% EURm, 20% BRLm")
- Alert when any position drifts more than the configured threshold
- Generate risk reports with real numbers: current vs target allocation, drift %, cost of rebalance`,
  },
  {
    id: "dao-ops",
    name: "DAO Operations",
    tagline: "Automate DAO treasury & governance",
    description: "Manages DAO treasury, tracks proposals, executes approved disbursements, and reports financials.",
    tags: ["dao", "governance", "treasury", "multisig"],
    defaultOfferings: [
      { name: "Treasury Report", description: "Generate a DAO treasury report — balances, inflows, outflows, runway estimate", feeType: "fixed" as const, fee: "2", requiresFunds: false },
      { name: "Proposal Summary", description: "Summarize active governance proposals with impact analysis and voting recommendation", feeType: "fixed" as const, fee: "1", requiresFunds: false },
      { name: "Grant Disbursement", description: "Execute approved grant payments from DAO treasury to recipients", feeType: "fixed" as const, fee: "0.5", requiresFunds: true },
      { name: "Contributor Payroll", description: "Process monthly contributor payments based on approved budget", feeType: "fixed" as const, fee: "1", requiresFunds: true },
    ],
    systemPrompt: `You are a DAO operations agent on Celo. You help DAOs manage treasury and governance efficiently.
- Send payments via [ACTION:send:AMOUNT:TOKEN:ADDRESS] for approved disbursements
- Check treasury balances via [ACTION:balance:ADDRESS]
- Summarize governance proposals clearly: what it does, who benefits, cost, risk
- Generate financial reports with real numbers from wallet data
- Always require explicit approval before executing any payment
- Track spending against approved budgets — flag overruns immediately`,
  },
  {
    id: "nft-agent",
    name: "NFT Agent",
    tagline: "NFT analytics & portfolio management",
    description: "Tracks NFT collections, analyzes floor prices, and helps manage NFT portfolios on Celo.",
    tags: ["nft", "analytics", "collections", "celo"],
    defaultOfferings: [
      { name: "Collection Analysis", description: "Deep dive into an NFT collection — floor price, volume, holder distribution, rarity", feeType: "fixed" as const, fee: "1.5", requiresFunds: false },
      { name: "Portfolio Valuation", description: "Estimate total value of an NFT portfolio based on floor prices and recent sales", feeType: "fixed" as const, fee: "1", requiresFunds: false },
      { name: "Trend Report", description: "Weekly Celo NFT market report — top movers, new collections, volume trends", feeType: "fixed" as const, fee: "2", requiresFunds: false },
      { name: "Mint Alert", description: "Monitor and alert on new NFT mints matching your criteria (price, collection size, creator)", feeType: "fixed" as const, fee: "0.5", requiresFunds: false },
    ],
    systemPrompt: `You are an NFT analytics agent on Celo. You deliver real data and actionable insights about NFTs.
- Analyze collections: floor price trends, holder distribution, wash trading signals
- Value portfolios using recent sales data and floor prices
- Track the Celo NFT ecosystem: new collections, top sellers, volume trends
- Provide clear buy/hold/sell recommendations with reasoning
- Check wallet NFT holdings via [ACTION:balance:ADDRESS]
- Always cite data sources and flag when data might be stale`,
  },
  {
    id: "defi-yield",
    name: "Yield Optimizer",
    tagline: "Find the best DeFi yields on Celo",
    description: "Scans Celo DeFi protocols for optimal yield opportunities and manages liquidity positions.",
    tags: ["defi", "yield", "farming", "liquidity", "celo"],
    defaultOfferings: [
      { name: "Yield Scan", description: "Scan all Celo DeFi protocols and rank top yield opportunities by APY and risk", feeType: "fixed" as const, fee: "1", requiresFunds: false },
      { name: "Position Management", description: "Monitor and manage your active DeFi positions — track IL, rewards, and health", feeType: "fixed" as const, fee: "1.5", requiresFunds: false },
      { name: "Strategy Builder", description: "Design a yield strategy based on risk tolerance, capital, and time horizon", feeType: "fixed" as const, fee: "2", requiresFunds: false },
      { name: "Harvest & Compound", description: "Claim farming rewards and reinvest for maximum compound returns", feeType: "percentage" as const, fee: "0.03", requiresFunds: true },
    ],
    systemPrompt: `You are a DeFi yield optimization agent on Celo. You help users maximize returns while managing risk.
- Scan protocols: Ubeswap, Moola Market, Curve (Celo), Mento pools
- Execute swaps via [ACTION:swap:AMOUNT:FROM:TO] to enter/exit positions
- Check balances via [ACTION:balance:ADDRESS]
- Always quantify risk: smart contract risk, IL risk, protocol risk, liquidity risk
- Compare yields honestly — high APY often means high risk
- Present opportunities in a clear table: Protocol, Pool, APY, TVL, Risk Level`,
  },
  {
    id: "custom",
    name: "Custom Agent",
    tagline: "Build your own",
    description: "Blank slate — write your own system prompt and configure everything from scratch.",
    tags: ["custom"],
    defaultOfferings: [
      { name: "Custom Service", description: "", feeType: "fixed" as const, fee: "1", requiresFunds: false },
    ],
    systemPrompt: "",
  },
];

const LLM_PROVIDERS = [
  { id: "openai", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4.1-mini", "gpt-4.1"] },
  { id: "anthropic", name: "Anthropic", models: ["claude-sonnet-4-5", "claude-haiku-3-5", "claude-opus-4", "claude-sonnet-4"] },
  { id: "google", name: "Google", models: ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro"] },
  { id: "deepseek", name: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "meta", name: "Meta", models: ["llama-4-scout", "llama-4-maverick", "llama-3.3-70b"] },
  { id: "mistral", name: "Mistral", models: ["mistral-medium-3", "mistral-small-3", "codestral"] },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "template" | "agent" | "offerings" | "llm" | "review" | "deploying" | "done";

const STEP_ORDER: { key: Step; label: string }[] = [
  { key: "template", label: "Template" },
  { key: "agent", label: "Profile" },
  { key: "offerings", label: "Services" },
  { key: "llm", label: "AI Model" },
  { key: "review", label: "Launch" },
];

function StepProgress({ current }: { current: Step }) {
  const idx = STEP_ORDER.findIndex((s) => s.key === current);
  if (idx < 0) return null;
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEP_ORDER.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1">
          <div className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition ${
              i < idx ? "bg-[#F4C430] text-[#0A0A0A]" : i === idx ? "bg-[#F4C430]/20 text-[#F4C430] ring-2 ring-[#F4C430]/40" : "bg-white/[0.06] text-[#A1A1A1]/40"
            }`}>
              {i < idx ? "✓" : i + 1}
            </div>
            <span className={`text-xs hidden sm:block ${i <= idx ? "text-[#F5F5F5]" : "text-[#A1A1A1]/30"}`}>{s.label}</span>
          </div>
          {i < STEP_ORDER.length - 1 && (
            <div className={`h-px flex-1 mx-2 ${i < idx ? "bg-[#F4C430]/40" : "bg-white/[0.06]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

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
  const [deployedNftId, setDeployedNftId] = useState<number | null>(null);
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
    llmModel: "claude-haiku-3-5",
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
      offerings: t.defaultOfferings.map((o) => ({
        ...o,
        paymentToken: CELO_TOKENS.USDm,
      })),
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

  async function uploadAvatar(agentId: string): Promise<string | null> {
    const file = (window as any).__nastarAvatarFile as File | null;
    if (!file) return null;

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${agentId.toLowerCase()}.${ext}`;

      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (error) {
        console.warn("Avatar upload failed:", error.message);
        return null;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.warn("Avatar upload error:", err);
      return null;
    }
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

      // 2. Gas-Sponsored Deployment (server pays gas)
      setStatus("Deploying agent on-chain (gas sponsored)...");
      const primaryOffering = config.offerings[0];
      const feeForChain = BigInt(Math.floor(parseFloat(primaryOffering.fee) * 1e18));
      const tagList = config.tags.split(",").map((t: string) => t.trim()).filter(Boolean);

      const sponsorRes = await fetch(`${API_URL}/v1/sponsor/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress,
          name: config.name,
          description: primaryOffering.description,
          endpoint: `${API_URL}/api/agent/endpoint`,
          paymentToken: primaryOffering.paymentToken,
          pricePerCall: feeForChain.toString(),
          tags: tagList,
        }),
      });

      if (!sponsorRes.ok) {
        const errData = await sponsorRes.json().catch(() => ({}));
        throw new Error(errData.error || "Sponsored deployment failed");
      }

      const sponsorData = await sponsorRes.json();
      const agentNftId = sponsorData.agentNftId as number | null;

      // 4. Store agent config + register hosted runtime
      setStatus("Storing agent configuration...");
      const apiKey = generateApiKey();

      // Detect LLM provider from model name
      const detectProvider = (model: string): string => {
        if (model.startsWith("claude")) return "anthropic";
        if (model.startsWith("gemini")) return "google";
        return "openai";
      };

      const llmProvider = config.llmProvider === "platform"
        ? detectProvider(config.llmModel)
        : config.llmProvider;

      // Register hosted agent runtime (LLM config)
      await fetch(`${API_URL}/v1/hosted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentWallet: agentWallet.address,
          ownerAddress,
          apiKey,
          agentNftId,
          serviceId: sponsorData.serviceId,
          name: config.name,
          description: config.description,
          templateId: config.templateId,
          systemPrompt: config.systemPrompt,
          llmProvider,
          llmModel: config.llmModel,
          llmApiKey: config.llmProvider === "platform"
            ? "PLATFORM_PROVIDED"
            : config.llmApiKey,
          spendingLimits: { maxPerCallUsd: 10, dailyLimitUsd: 50, requireConfirmAboveUsd: 25 },
        }),
      });

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
        serviceId: sponsorData.serviceId,
        endpoint: `${API_URL}/v1/hosted/${agentWallet.address.toLowerCase()}`,
        tags: tagList,
        pricePerCall: primaryOffering.fee,
        paymentToken: primaryOffering.paymentToken,
        avatar: await uploadAvatar(agentWallet.address),
        createdAt: Date.now(),
      });

      // 5. Agent metadata URI already set by sponsor endpoint

      setDeployedId(agentWallet.address);
      setDeployedNftId(agentNftId);
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
        <PageTitle title="Launch Agent" />
        <div className="max-w-3xl mx-auto px-4 py-10">
          <StepProgress current="template" />
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
                  <span className="text-[#A1A1A1]/30 text-xs">{t.defaultOfferings.length} service{t.defaultOfferings.length > 1 ? "s" : ""}</span>
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
          <StepProgress current="agent" />

          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("template")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Agent Profile</h1>
              <p className="text-[#A1A1A1]/50 text-xs">Who is your agent?</p>
            </div>
          </div>

          <div className="space-y-6">

            {/* Avatar (left) + Name (right) — matches agent profile layout */}
            <div className="flex items-start gap-5">
              {/* Avatar upload */}
              <div className="shrink-0">
                <button type="button"
                  onClick={() => document.getElementById("avatar-upload")?.click()}
                  className={`w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden transition ${
                    config.avatarPreview
                      ? "border-green-500/40"
                      : "border-white/[0.15] hover:border-[#F4C430]/40"
                  }`}>
                  {config.avatarPreview ? (
                    <img src={config.avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center">
                      <span className="text-2xl block">📷</span>
                      <span className="text-[#A1A1A1]/30 text-[8px]">Upload</span>
                    </div>
                  )}
                </button>
                <input id="avatar-upload" type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2MB"); return; }
                    (window as any).__nastarAvatarFile = file;
                    const reader = new FileReader();
                    reader.onload = () => setConfig((c) => ({ ...c, avatarPreview: reader.result as string }));
                    reader.readAsDataURL(file);
                  }}
                />
                {config.avatarPreview && (
                  <button type="button" onClick={() => {
                    setConfig((c) => ({ ...c, avatarPreview: "" }));
                    (window as any).__nastarAvatarFile = null;
                  }} className="text-red-400/50 text-[10px] mt-1 hover:text-red-400 block mx-auto">Remove</button>
                )}
              </div>

              {/* Name + hint */}
              <div className="flex-1 min-w-0">
                <label className="text-[#A1A1A1]/60 text-xs mb-1.5 block">Agent Name *</label>
                <input
                  value={config.name}
                  onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))}
                  placeholder={`e.g. ${tmpl.name}`}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm transition"
                />
                <p className="text-[#A1A1A1]/30 text-[10px] mt-1.5">JPG, PNG, or GIF. Max 2MB, square recommended.</p>
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
          <StepProgress current="offerings" />

          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("agent")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Service Offerings</h1>
              <p className="text-[#A1A1A1]/50 text-xs">What does your agent sell?</p>
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
                          <p className="text-[#A1A1A1]/40 text-[10px] mt-0.5">Commission from buyer's payment in any supported stablecoin</p>
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
          <StepProgress current="llm" />
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("offerings")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">AI Model</h1>
              <p className="text-[#A1A1A1]/50 text-xs">Choose how your agent thinks</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Platform vs Own Key toggle */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfig((c) => ({ ...c, llmProvider: "platform", llmModel: "claude-haiku-3-5", llmApiKey: "" }))}
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
                onClick={() => setConfig((c) => ({ ...c, llmProvider: "openai", llmModel: "" }))}
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
                    { id: "claude-haiku-3-5", label: "Claude Haiku", desc: "Fast & efficient" },
                    { id: "claude-sonnet-4", label: "Claude Sonnet", desc: "Best reasoning" },
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
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {LLM_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setConfig((c) => ({ ...c, llmProvider: p.id, llmModel: p.models[0] }))}
                        className={`py-2.5 rounded-xl border font-medium transition text-xs ${
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {selectedProvider.models.map((m) => (
                      <button
                        key={m}
                        onClick={() => setConfig((c) => ({ ...c, llmModel: m }))}
                        className={`py-2 px-3 rounded-xl border font-mono text-xs transition ${
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
                      config.llmProvider === "anthropic" ? "sk-ant-api03-..." : config.llmProvider === "google" ? "AIzaSy..." : "your-api-key...";
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
          <StepProgress current="review" />
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setStep("llm")} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Review & Deploy</h1>
              <p className="text-[#A1A1A1]/50 text-xs">Confirm and launch</p>
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
                <div className="w-12 h-12 rounded-xl bg-[#F4C430]/10 flex items-center justify-center overflow-hidden shrink-0">
                  {config.avatarPreview ? (
                    <img src={config.avatarPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🤖</span>
                  )}
                </div>
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
                <div className="flex justify-between"><span className="text-[#A1A1A1]/50">Hosted Runtime</span><span className="text-green-400 text-xs">Nastar Cloud</span></div>
              </div>
            </div>

            <p className="text-[#A1A1A1]/30 text-[10px] text-center">
              Gas fees are sponsored by Nastar Protocol. No CELO needed.
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
            {deployedNftId && (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <label className="text-[#A1A1A1]/40 text-[10px] uppercase tracking-wider">ERC-8004 Identity</label>
                <code className="text-[#F4C430] text-sm font-mono block mt-1">Token #{deployedNftId}</code>
              </div>
            )}
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
              onClick={() => router.push("/browse")}
              className="flex-1 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] font-medium text-sm hover:bg-white/[0.08] transition"
            >
              Browse Marketplace
            </button>
            <button
              onClick={() => router.push(`/agents/${deployedNftId || deployedId}`)}
              className="flex-1 py-3 rounded-xl gradient-btn font-semibold text-sm hover:shadow-[0_0_20px_rgba(244,196,48,0.3)] transition"
            >
              View Agent
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
