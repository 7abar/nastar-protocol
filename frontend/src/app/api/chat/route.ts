import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createPublicClient, http, formatUnits } from "viem";

// Celo Sepolia chain config (inline to avoid client import issues)
const celoSepolia = {
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
} as const;

const SERVICE_REGISTRY = "0x1aB9810d5E135f02fC66E875a77Da8fA4e49758e" as const;

const SERVICE_REGISTRY_ABI = [
  {
    type: "function" as const,
    name: "getActiveServices" as const,
    inputs: [
      { name: "offset", type: "uint256" as const },
      { name: "limit", type: "uint256" as const },
    ],
    outputs: [
      {
        name: "result",
        type: "tuple[]" as const,
        components: [
          { name: "agentId", type: "uint256" as const },
          { name: "provider", type: "address" as const },
          { name: "name", type: "string" as const },
          { name: "description", type: "string" as const },
          { name: "endpoint", type: "string" as const },
          { name: "paymentToken", type: "address" as const },
          { name: "pricePerCall", type: "uint256" as const },
          { name: "active", type: "bool" as const },
          { name: "createdAt", type: "uint256" as const },
          { name: "updatedAt", type: "uint256" as const },
        ],
      },
      { name: "count", type: "uint256" as const },
    ],
    stateMutability: "view" as const,
  },
] as const;

const client = createPublicClient({
  chain: celoSepolia,
  transport: http(),
});

async function getServicesContext(): Promise<string> {
  try {
    const [services] = await client.readContract({
      address: SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getActiveServices",
      args: [0n, 50n],
    });

    if (services.length === 0) {
      return "No agents are currently registered on the marketplace. But users can register their own agents at /agents/register or via `npx clawhub@latest install nastar-protocol`.";
    }

    return services
      .map(
        (s, i) =>
          `Agent #${i}: "${s.name}" (ID: ${s.agentId}) — ${s.description}. Price: ${formatUnits(s.pricePerCall, 6)} USDC. Endpoint: ${s.endpoint}`
      )
      .join("\n");
  } catch {
    return "Could not fetch services from chain. The marketplace may be temporarily unavailable.";
  }
}

const SYSTEM_PROMPT = `You are Nastar Butler — the AI concierge for Nastar, a decentralized AI agent marketplace on Celo.

Your job:
1. Understand what the user needs
2. Recommend the best agent(s) from the marketplace
3. Help them hire an agent (explain the process)
4. Answer questions about Nastar, pricing, escrow, disputes

Personality: Helpful, knowledgeable, concise. Not overly formal. You know crypto and AI agents well.

Key facts about Nastar:
- Decentralized marketplace for AI agents on Celo blockchain
- On-chain escrow: funds locked in smart contract, released on delivery
- autoConfirm: payment auto-releases when agent delivers (buyer can dispute within 3 days)
- 2.5% protocol fee on seller payments only, buyer refunds always fee-free
- ERC-8004 identity NFTs for every agent
- Supports any ERC-20 stablecoin (cUSD, USDT, USDm, USDC, regional stablecoins)
- Dispute resolution: seller can contest (50/50 split) or buyer gets full refund
- No admin keys, fully permissionless
- Register agents at /agents/register or via CLI: npx clawhub@latest install nastar-protocol

When recommending an agent, include:
- Agent name and what it does
- Price
- Say "Click 'Hire Agent' below to proceed" (the UI will show hire buttons)

If no agents match the request, suggest:
- Checking back later
- Registering their own agent
- Trying a different search term

Keep responses concise (2-4 sentences for simple queries, more for complex ones).
Do NOT use markdown headers. Use plain text with occasional bold for emphasis.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "The chat butler is not configured yet. Set OPENAI_API_KEY in your environment to enable AI-powered recommendations. For now, try browsing the /offerings page to see available agents.",
    });
  }

  const openai = new OpenAI({ apiKey });

  const { messages, services } = await req.json();

  // Build services context
  const servicesContext =
    services || (await getServicesContext());

  const systemMessage = `${SYSTEM_PROMPT}\n\nCurrently available agents on the marketplace:\n${servicesContext}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        ...messages.slice(-10), // Last 10 messages for context
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "I couldn't process that. Could you try rephrasing?";

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("OpenAI error:", msg);
    return NextResponse.json({
      reply: "Something went wrong with the AI. Try again in a moment.",
    });
  }
}
