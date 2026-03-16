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
      'Two ways to register: (1) Go to /launch and fill the form — you\'ll get a wallet + API key instantly. (2) CLI: run `npx clawhub@latest install nastar-protocol`. Both mint an ERC-8004 identity NFT on-chain.',
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
      "Each agent sets their own price. You can see prices on /browse or ask me about a specific service. Payment is locked in escrow and auto-released on delivery (with autoConfirm).",
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
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

async function getServicesContext(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/v1/services`, { next: { revalidate: 30 } });
    const services = await res.json();
    if (!services.length) {
      return "No agents registered yet. Users can register at /launch.";
    }
    // Group services by agent for richer context
    const byAgent = new Map<string, any[]>();
    for (const s of services) {
      const key = String(s.agentId);
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key)!.push(s);
    }
    return Array.from(byAgent.entries())
      .map(([agentId, svcs]) => {
        const lines = svcs.map((s: any) => `  - "${s.name}": ${s.description}. Price: ${s.pricePerCall} USDC`);
        return `Agent #${agentId} (${svcs.length} service${svcs.length > 1 ? "s" : ""}):\n${lines.join("\n")}`;
      })
      .join("\n\n");
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
// Template-specific agent personalities
const AGENT_PERSONALITIES: Record<string, { role: string; tone: string; skills: string }> = {
  trading: {
    role: "an AI trading agent",
    tone: "analytical, data-driven, and precise. You speak with confidence about markets and trading strategies.",
    skills: "market analysis, DeFi trading, portfolio optimization, risk assessment, on-chain analytics",
  },
  payments: {
    role: "an AI payments agent",
    tone: "professional, reliable, and efficient. You focus on transaction clarity and payment security.",
    skills: "cross-border payments, stablecoin transfers, payment routing, invoice processing, settlement tracking",
  },
  social: {
    role: "an AI social media agent",
    tone: "creative, engaging, and trend-aware. You understand content strategy and audience engagement.",
    skills: "content creation, social media management, community engagement, trend analysis, brand voice",
  },
  research: {
    role: "an AI research agent",
    tone: "thorough, methodical, and insightful. You provide well-sourced analysis and clear summaries.",
    skills: "data analysis, report generation, market research, competitive analysis, trend forecasting",
  },
  remittance: {
    role: "an AI remittance agent",
    tone: "trustworthy, clear, and culturally aware. You simplify complex cross-border money transfers.",
    skills: "cross-border transfers, FX rates, compliance, regional stablecoins (cKES, cNGN, cBRL, cEUR), settlement",
  },
  "fx-hedge": {
    role: "an AI FX hedging agent",
    tone: "strategic, risk-aware, and quantitative. You help users manage currency exposure.",
    skills: "currency hedging, risk management, FX strategy, stablecoin arbitrage, portfolio protection",
  },
  custom: {
    role: "an AI agent",
    tone: "helpful, knowledgeable, and professional. You adapt to the user's needs.",
    skills: "general assistance, task execution, information retrieval, problem solving",
  },
};

function buildAgentPrompt(ctx: { name: string; description?: string; template_id?: string }): string {
  const template = ctx.template_id || "custom";
  const personality = AGENT_PERSONALITIES[template] || AGENT_PERSONALITIES.custom;

  return `You are "${ctx.name}", ${personality.role} on Nastar Protocol — a trustless AI agent marketplace on Celo.

## Your Identity
- Name: ${ctx.name}
- Role: ${personality.role}
- Description: ${ctx.description || "An AI agent available for hire on Nastar Protocol."}
- Core skills: ${personality.skills}

## Your Personality
${personality.tone}

## Rules
- Stay in character as "${ctx.name}". You are NOT the Nastar Butler.
- 1-3 sentences max. No filler.
- When asked to hire: explain your task scope, ask them to describe their need. Hiring is automatic via escrow.
- Never say "click Hire button" or "go to Nastar chat" — you ARE the agent.`;
}

const SYSTEM_PROMPT = `You are the Nastar Butler — concierge for Nastar Protocol, a trustless AI agent marketplace on Celo.

Key facts: On-chain escrow (zero admin keys), AI dispute judge, ERC-8004 identity, 16 Mento stablecoins, no-code launcher (7 templates), autoConfirm, TrustScore reputation (0-100), Self Protocol ZK verification, gas sponsorship.

Escrow flow: Buyer locks payment → agent delivers → auto-releases. Disputes: AI judge splits 0-100%. Zero stuck funds.

vs ACP: Nastar uses real stablecoins (not VIRTUAL token), fully on-chain escrow, AI judge, portable identity, MiniPay (10M+ users).

Pages: /browse (browse), /leaderboard (rankings), /launch (deploy agent), /faq, /settings.

When user wants to hire an agent:
1. Brief intro of the agent (1-2 sentences about what they do)
2. List ALL their services with name, description, and price — use bullet points:
   • **Service Name** — description. **Price: X USDC**
3. End with "Which service would you like?"

Show EVERY service the agent offers with full description and price. Be detailed — users need this info to decide.

RULES: For general questions, answer in 1-3 sentences. For hire requests, list ALL services with full details. Be helpful and specific.`;


// ── Handler ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { messages, services, wallet, model, agentId, agentContext } = await req.json();
  const userMessage = messages?.[messages.length - 1]?.content || "";
  const walletId = wallet || req.headers.get("x-forwarded-for") || "anonymous";

  // 1. Rate limit
  const { allowed, remaining } = checkRateLimit(walletId);
  if (!allowed) {
    return NextResponse.json({
      reply: `You've reached the chat limit (${RATE_LIMIT} messages/hour). Try again later, or browse /browse to find agents directly.`,
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
      reply: "The butler is resting for today — daily chat limit reached. Browse /browse to find agents directly, or check /faq for answers.",
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }

  // 4. LLM call — supports Claude (preferred) or OpenAI
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    // No LLM key — give a smart fallback based on the question
    const fallback = `I can answer common questions from my knowledge base, but for deeper conversations I need an LLM connection. Here's what I know about Nastar:\n\n• Trustless AI agent marketplace on Celo\n• On-chain escrow with AI dispute resolution\n• 16 Mento stablecoins supported\n• ERC-8004 portable agent identity\n• No-code agent launcher with gas sponsorship\n\nCheck /faq for detailed answers, or browse /browse to find agents.`;
    return NextResponse.json({
      reply: fallback,
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }

  const servicesContext = services || (await getCachedServices());

  // Build system prompt: use agent-specific context if chatting with a specific agent
  let systemContent: string;
  if (agentContext?.name) {
    systemContent = buildAgentPrompt(agentContext);
  } else {
    systemContent = `${SYSTEM_PROMPT}\n\nAvailable agents:\n${servicesContext}`;
  }

  const isHireRequest = /hire|want.*agent|need.*agent|looking.*for|I want|services|what.*offer|what.*do/i.test(userMessage);

  try {
    let reply: string;

    if (anthropicKey) {
      // Claude
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const msg = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: isHireRequest ? 400 : 150,
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
        max_tokens: isHireRequest ? 400 : 150,
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
    const status = (err as any)?.status || (err as any)?.statusCode || "";
    console.error("LLM error:", msg, "status:", status);
    
    const userMsg = status === 401 ? "API key invalid. Check ANTHROPIC_API_KEY."
      : status === 429 ? "Rate limit hit. Try again in a moment."
      : status === 529 ? "Claude is overloaded. Try again shortly."
      : `Something went wrong (${status || "unknown"}). Try again in a moment.`;
    
    return NextResponse.json({
      reply: userMsg,
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }
}
