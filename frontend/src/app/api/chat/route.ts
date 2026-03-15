import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ── Rate Limiter (in-memory, per wallet) ────────────────────────────────────
const RATE_LIMIT = 20; // messages per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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
    patterns: [/what is nastar/i, /apa itu nastar/i, /about nastar/i],
    answer:
      "Nastar is a decentralized marketplace where AI agents sell services and earn income on Celo. All payments are secured by on-chain escrow — no middlemen, no admin keys. Agents get ERC-8004 identity NFTs and portable reputation.",
  },
  {
    patterns: [/how.*(register|create|deploy).*(agent|service)/i, /daftar.*agent/i, /register/i],
    answer:
      'Two ways to register: (1) Go to /agents/register and fill the form — you\'ll get a wallet + API key instantly. (2) CLI: run `npx clawhub@latest install nastar-protocol`. Both mint an ERC-8004 identity NFT on-chain.',
  },
  {
    patterns: [/fee|biaya|cost|charge/i],
    answer:
      "Nastar charges 20% protocol fee on seller payments only. Buyer refunds are always fee-free. The fee is immutable — set at contract deployment, no admin can change it.",
  },
  {
    patterns: [/dispute|sengketa|refund|complain/i],
    answer:
      "If unhappy with delivery, dispute within 3 days. The seller can contest for a 50/50 split, or if they don't respond, you get a full refund. If the buyer disappears after disputing, the seller claims after 30 days. Zero stuck funds.",
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
    patterns: [/vs.*acp|vs.*virtuals|beda.*acp|compare|perbandingan/i],
    answer:
      "Key differences from ACP (Virtuals): Nastar has on-chain agent identity (ERC-8004), multi-stablecoin support (not just USDC), fully on-chain escrow, zero admin keys, permissionless registration, and regional stablecoin support. Check /compare for the full breakdown.",
  },
  {
    patterns: [/price|harga|how much|berapa/i],
    answer:
      "Each agent sets their own price. You can see prices on /offerings or ask me about a specific service. Payment is locked in escrow and auto-released on delivery (with autoConfirm).",
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
const SYSTEM_PROMPT = `You are Nastar — AI concierge for Nastar, a decentralized AI agent marketplace on Celo.
Help users find agents, explain escrow/payments, guide hiring. Be concise (2-4 sentences).
Key: on-chain escrow, autoConfirm (auto-pay on delivery, dispute 3 days), 20% fee (seller only), ERC-8004 identity, any ERC-20 stablecoin, no admin keys.
Register: /agents/register or npx clawhub@latest install nastar-protocol.
When recommending agents, say "Click 'Hire Agent' below to proceed."`;

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

  // 3. LLM call
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply: "Nastar is not configured yet. Browse /offerings to see available agents, or check /faq for common questions.",
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }

  const openai = new OpenAI({ apiKey });
  const servicesContext = services || (await getCachedServices());

  // Build system prompt: use agent-specific context if chatting with a specific agent
  const systemContent = agentContext?.systemPrompt
    ? `${agentContext.systemPrompt}\n\nYou are "${agentContext.name}". ${agentContext.description || ""}\nBe helpful and concise.`
    : `${SYSTEM_PROMPT}\n\nAvailable agents:\n${servicesContext}`;

  const selectedModel = model && ["gpt-4o-mini", "gpt-4o"].includes(model) ? model : "gpt-4o-mini";

  try {
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: "system", content: systemContent },
        ...messages.slice(-6),
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "Could you try rephrasing?";

    return NextResponse.json({
      reply,
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("OpenAI error:", msg);
    return NextResponse.json({
      reply: "Something went wrong. Try again in a moment.",
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  }
}
