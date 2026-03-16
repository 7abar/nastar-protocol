import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ── Rate Limiter (in-memory, per wallet) ────────────────────────────────────
const RATE_LIMIT = 10; // messages per wallet per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ── Global daily budget (protects API key spend) ────────────────────────────
const DAILY_LLM_LIMIT = 200; // max LLM calls per day (FAQ cache doesn't count)
let dailyLLMCalls = 0;
let dailyResetAt = Date.now() + 24 * 60 * 60 * 1000;

function checkDailyBudget(): boolean {
  const now = Date.now();
  if (now > dailyResetAt) {
    dailyLLMCalls = 0;
    dailyResetAt = now + 24 * 60 * 60 * 1000;
  }
  if (dailyLLMCalls >= DAILY_LLM_LIMIT) return false;
  dailyLLMCalls++;
  return true;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(wallet: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(wallet);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(wallet, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

// Clean up stale entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 10 * 60 * 1000);

// ── FAQ Cache (zero LLM cost) ───────────────────────────────────────────────
const FAQ_CACHE: { patterns: RegExp[]; answer: string }[] = [
  {
    patterns: [/what is nastar/i, /apa itu nastar/i, /about nastar/i, /how does nastar work/i, /tell me about nastar/i, /explain nastar/i],
    answer:
      "Nastar is a decentralized marketplace where AI agents sell services and earn income on Celo. All payments are secured by on-chain escrow — no middlemen, no admin keys. Agents get ERC-8004 identity NFTs and portable reputation.",
  },
  {
    patterns: [/how.*(register|create|deploy|launch).*(agent|service)/i, /daftar.*agent/i, /register/i, /launch.*agent/i],
    answer:
      'Two ways to register: (1) Go to /agents/register and fill the form — you\'ll get a wallet + API key instantly. (2) CLI: run `npx clawhub@latest install nastar-protocol`. Both mint an ERC-8004 identity NFT on-chain.',
  },
  {
    patterns: [/fee|biaya|cost|charge/i],
    answer:
      "Nastar charges 20% protocol fee on seller payments only. Buyer refunds are always fee-free. The fee is immutable — set at contract deployment, no admin can change it.",
  },
  {
    patterns: [/dispute|sengketa|refund|complain|ai.*judge|judge.*ai|resolve.*conflict/i],
    answer:
      "If unhappy with delivery, dispute within 3 days. An AI Judge reviews evidence from both sides — your complaint and the agent's delivery proof — then determines a fair split (anywhere from 0% to 100%) and executes it on-chain. The verdict and reasoning are stored permanently on the blockchain. Buyer refunds are always fee-free. If the buyer abandons a dispute, the seller can claim after 30 days. Zero stuck funds.",
  },
  {
    patterns: [/autoconfirm|auto.?confirm|otomatis/i],
    answer:
      "autoConfirm means payment auto-releases to the seller when they deliver. The buyer opts in at deal creation. You can still dispute within 3 days if the delivery is bad. It enables fully automated agent-to-agent commerce.",
  },
  {
    patterns: [/stablecoin|token|currency|mata uang/i],
    answer:
      "Nastar supports any ERC-20 token on Celo: cUSD, USDT, USDm, USDC, and regional stablecoins like cKES (Kenya), cNGN (Nigeria), cBRL (Brazil), cEUR (Euro). Agents choose which token to accept.",
  },
  {
    patterns: [/erc.?8004|identity|nft|identitas/i],
    answer:
      "ERC-8004 is a Celo identity NFT standard. Every agent and buyer gets one (free to mint). It's your on-chain identity — tied to reputation, deal history, and revenue. Portable across any platform on Celo.",
  },
  {
    patterns: [/vs.*acp|vs.*virtuals|beda.*acp|compare|perbandingan|different.*virtuals|different.*acp|nastar.*acp|acp.*nastar/i],
    answer:
      "Key differences from ACP (Virtuals): Nastar has on-chain agent identity (ERC-8004), multi-stablecoin support (not just USDC), fully on-chain escrow, zero admin keys, permissionless registration, and regional stablecoin support. Check the FAQ for the full breakdown.",
  },
  {
    patterns: [/price|harga|how much|berapa/i],
    answer:
      "Each agent sets their own price. You can see prices on /offerings or ask me about a specific service. Payment is locked in escrow and auto-released on delivery (with autoConfirm).",
  },
  {
    patterns: [/escrow.*protect|escrow.*work|how.*escrow|protect.*buyer|protect.*seller/i],
    answer:
      "Nastar's escrow works in 3 steps: (1) Buyer creates a deal — funds lock in the smart contract (not held by Nastar). (2) Agent delivers work with proof. With autoConfirm, payment releases automatically. (3) Buyer can dispute within 3 days if unsatisfied — the AI Judge reviews evidence and determines a fair split. Every path has a resolution: seller timeout, buyer timeout, dispute timeout, abandoned recovery. Zero stuck funds — verified across 4 audit rounds with 37/37 tests passing. No admin keys, no backdoors.",
  },
  {
    patterns: [/trustscore|trust.*score|reputation.*work|reputation.*oracle/i],
    answer:
      "TrustScore is a composite reputation score (0-100) computed entirely from on-chain data: deal completion rate, dispute outcomes, total volume, and account tenure. Tiers: Diamond (85-100), Gold (70-84), Silver (50-69), Bronze (30-49), New (0-29). No fake reviews possible — all data comes from verified smart contract events. Check the Leaderboard at /leaderboard to see top agents ranked by TrustScore.",
  },
  {
    patterns: [/help|bantuan|what can you do|bisa apa/i],
    answer:
      "I can help you: (1) Find AI agents for your task, (2) Explain how escrow and payments work, (3) Guide you through hiring an agent, (4) Answer questions about Nastar. Just tell me what you need!",
  },
];

function checkFAQCache(message: string): string | null {
  for (const faq of FAQ_CACHE) {
    if (faq.patterns.some((p) => p.test(message))) {
      return faq.answer;
    }
  }
  return null;
}

// ── API URL for services context ────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

async function getServicesContext(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/v1/services`, { next: { revalidate: 30 } });
    const services = await res.json();
    if (!services.length) {
      return "No agents registered yet. Users can register at /agents/register.";
    }
    return services
      .map((s: any) => `"${s.name}" (ID: ${s.agentId}) — ${s.description}. Price: ${s.pricePerCall} USDC`)
      .join("\n");
  } catch {
    return "Could not fetch services.";
  }
}

// Cache services context for 60s
let servicesCache: { data: string; expiresAt: number } | null = null;
async function getCachedServices(): Promise<string> {
  const now = Date.now();
  if (servicesCache && now < servicesCache.expiresAt) return servicesCache.data;
  const data = await getServicesContext();
  servicesCache = { data, expiresAt: now + 60_000 };
  return data;
}

// ── System Prompt (compact to save tokens) ──────────────────────────────────
const SYSTEM_PROMPT = `You are the Nastar Butler — a knowledgeable concierge for Nastar Protocol, a trustless AI agent marketplace on Celo.

## About Nastar
Nastar lets AI agents sell services and earn money on-chain. All payments go through smart contract escrow — no middlemen, no admin keys, no chargebacks.

## Key Features
- **On-Chain Escrow**: Buyer locks payment → agent delivers → payment auto-releases. 8 deal states, reentrancy-protected. Zero admin keys or backdoors.
- **AI Dispute Judge**: When deals go wrong, an AI judge reviews evidence from both sides, determines a fair split (0-100%), and executes it on-chain. No human arbitrators, no weeks of waiting.
- **TrustScore Reputation**: Composite score (0-100) from completion rate, dispute history, volume, and tenure. Diamond (85-100), Gold (70-84), Silver (50-69), Bronze (30-49), New (0-29). All from on-chain data — no fake reviews.
- **ERC-8004 Identity**: Every agent gets an NFT on Celo's global Identity Registry. Portable reputation across the ecosystem. Shows on agentscan.info.
- **16 Mento Stablecoins**: USDm, USDC, EURm, GBPm, BRLm, NGNm, KESm, JPYm, and more. Agents choose which to accept per service.
- **No-Code Agent Launcher**: 7+ templates (Trading, Payments, Social, Research, Remittance, FX Hedge, Custom). Deploy in minutes, zero gas — Nastar sponsors all deployment costs.
- **autoConfirm**: Payment auto-releases on delivery. Buyer can still dispute within 3 days. Enables fully automated agent-to-agent commerce.
- **Self Protocol Verification**: ZK proof-of-human via passport/ID scan. No personal data on-chain — just a cryptographic proof.

## How Escrow Works
1. Buyer creates deal → funds locked in escrow smart contract
2. Agent accepts and delivers work with proof
3. With autoConfirm: payment releases automatically. Without: buyer confirms.
4. Buyer can dispute within 3 days of delivery
5. AI Judge resolves disputes with custom splits
6. Every path has a resolution — mathematically zero stuck funds (4 audit rounds, 37/37 tests passing)

## Protocol Fee
Protocol takes a fee on seller payments only. Buyer refunds are always 100% fee-free. Fee is immutable — set at deployment, no admin can change it.

## vs Virtuals ACP
ACP runs on Base with VIRTUAL token only and centralized infra. Nastar: 16 real stablecoins on Celo, fully on-chain escrow with zero admin keys, AI dispute judge, ERC-8004 portable identity, MiniPay integration (10M+ mobile users), Self Protocol ZK verification, gas sponsorship, and reputation oracle.

## Navigation
- /offerings — Browse agents and services
- /leaderboard — Top agents by reputation
- /launch — Deploy your own agent (no code needed)
- /faq — Detailed FAQ
- /settings — Wallet and profile settings

## Style
Be helpful, concise (3-5 sentences), and knowledgeable. You're a butler — professional but approachable. When recommending features, link to the relevant page.`;


// ── Handler ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { messages, services, wallet, model, agentId, agentContext } = await req.json();
  const userMessage = messages?.[messages.length - 1]?.content || "";
  const walletId = wallet || req.headers.get("x-forwarded-for") || "anonymous";

  // 1. Rate limit
  const { allowed, remaining } = checkRateLimit(walletId);
  if (!allowed) {
    return NextResponse.json({
      reply: `You've reached the chat limit (${RATE_LIMIT} messages/hour). Try again later, or browse /offerings to find agents directly.`,
      rateLimit: { remaining: 0, limit: RATE_LIMIT },
    });
  }

  // 2. FAQ cache (zero cost)
  const cached = checkFAQCache(userMessage);
  if (cached) {
    // Don't count cached answers toward rate limit
    const entry = rateLimitMap.get(walletId);
    if (entry) entry.count = Math.max(0, entry.count - 1);
    return NextResponse.json({
      reply: cached,
      rateLimit: { remaining: remaining + 1, limit: RATE_LIMIT },
      cached: true,
    });
  }

  // 3. Daily budget check (protects API key)
  if (!checkDailyBudget()) {
    return NextResponse.json({
      reply: "The butler is resting for today — daily chat limit reached. Browse /offerings to find agents directly, or check /faq for answers.",
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }

  // 4. LLM call — supports Claude (preferred) or OpenAI
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    // No LLM key — give a smart fallback based on the question
    const fallback = `I can answer common questions from my knowledge base, but for deeper conversations I need an LLM connection. Here's what I know about Nastar:\n\n• Trustless AI agent marketplace on Celo\n• On-chain escrow with AI dispute resolution\n• 16 Mento stablecoins supported\n• ERC-8004 portable agent identity\n• No-code agent launcher with gas sponsorship\n\nCheck /faq for detailed answers, or browse /offerings to find agents.`;
    return NextResponse.json({
      reply: fallback,
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }

  const servicesContext = services || (await getCachedServices());

  // Build system prompt: use agent-specific context if chatting with a specific agent
  const systemContent = agentContext?.systemPrompt
    ? `${agentContext.systemPrompt}\n\nYou are "${agentContext.name}". ${agentContext.description || ""}\nBe helpful and concise.`
    : `${SYSTEM_PROMPT}\n\nAvailable agents:\n${servicesContext}`;

  try {
    let reply: string;

    if (anthropicKey) {
      // Claude
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 250,
        system: systemContent,
        messages: messages.slice(-6).map((m: any) => ({
          role: m.role === "assistant" ? "assistant" as const : "user" as const,
          content: m.content,
        })),
      });
      reply = msg.content[0]?.type === "text" ? msg.content[0].text : "Could you try rephrasing?";
    } else {
      // OpenAI fallback
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemContent },
          ...messages.slice(-6),
        ],
        max_tokens: 300,
        temperature: 0.7,
      });
      reply = completion.choices[0]?.message?.content || "Could you try rephrasing?";
    }

    return NextResponse.json({
      reply,
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("LLM error:", msg);
    return NextResponse.json({
      reply: "Something went wrong. Try again in a moment.",
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }
}
