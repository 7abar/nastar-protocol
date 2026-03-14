"use client";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { createPublicClient, http, formatUnits, encodeFunctionData } from "viem";
import {
  celoSepoliaCustom,
  CONTRACTS,
  SERVICE_REGISTRY_ABI,
  ESCROW_ABI,
  ERC20_ABI,
  ERC8004_ABI,
} from "@/lib/contracts";

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

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  services?: Service[];
  serviceIndex?: number;
  txHash?: string;
  action?: "hire" | "confirm_hire";
}

export default function ChatPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A]" />}>
      <ChatPage />
    </Suspense>
  );
}

function ChatPage() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hey! I'm Nastar. I can help you find and hire AI agents. What do you need done?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load services once
  useEffect(() => {
    async function load() {
      try {
        const [result] = (await client.readContract({
          address: CONTRACTS.SERVICE_REGISTRY,
          abi: SERVICE_REGISTRY_ABI,
          functionName: "getActiveServices",
          args: [0n, 50n],
        })) as [Service[], bigint];
        setServices(result);
      } catch {}
    }
    load();
  }, []);

  // Pre-fill from query params (e.g. /chat?agent=40&name=CeloDataFeed)
  useEffect(() => {
    if (prefilled) return;
    const agentId = searchParams.get("agent");
    const agentName = searchParams.get("name");
    if (agentId && agentName) {
      setInput(`I want to hire Agent #${agentId} — ${agentName}`);
      setPrefilled(true);
    }
  }, [searchParams, prefilled]);

  function addMsg(msg: Omit<Message, "id">) {
    const m = { ...msg, id: Date.now().toString() + Math.random() };
    setMessages((prev) => [...prev, m]);
    return m;
  }

  function matchServices(query: string): Service[] {
    const q = query.toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        q.split(" ").some(
          (word) =>
            word.length > 2 &&
            (s.name.toLowerCase().includes(word) ||
              s.description.toLowerCase().includes(word))
        )
    );
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    addMsg({ role: "user", text: userText });

    // If not logged in, prompt login for hire actions but still allow chat
    setLoading(true);

    try {
      // Build conversation history for LLM
      const chatHistory = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));
      chatHistory.push({ role: "user", content: userText });

      // Build services context
      const servicesContext = services.length > 0
        ? services
            .map(
              (s, i) =>
                `Agent #${i}: "${s.name}" (ID: ${s.agentId}) — ${s.description}. Price: ${formatUnits(s.pricePerCall, 6)} USDC`
            )
            .join("\n")
        : "No agents registered yet.";

      // Call LLM API (sends wallet for rate limiting)
      const wallet = wallets?.[0]?.address || "anonymous";
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          services: servicesContext,
          wallet,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "Something went wrong. Try again.";

      // Check if LLM mentioned any agents — show hire buttons if so
      const mentionedServices = services.filter((s) =>
        reply.toLowerCase().includes(s.name.toLowerCase())
      );

      addMsg({
        role: "assistant",
        text: reply,
        services: mentionedServices.length > 0 ? mentionedServices : undefined,
      });
    } catch {
      // Fallback to static matching if API fails
      const matched = matchServices(userText);
      if (matched.length > 0) {
        addMsg({
          role: "assistant",
          text: `I found ${matched.length} agent${matched.length > 1 ? "s" : ""} that can help:`,
          services: matched,
        });
      } else if (services.length > 0) {
        addMsg({
          role: "assistant",
          text: "Here are the available agents:",
          services: services,
        });
      } else {
        addMsg({
          role: "assistant",
          text: "No agents are registered yet. Register your own at /agents/register or via `npx clawhub@latest install nastar-protocol`.",
        });
      }
    }

    setLoading(false);
  }

  async function handleHire(service: Service, serviceIndex: number) {
    if (!wallets.length) {
      addMsg({
        role: "assistant",
        text: "Please sign in first to hire this agent.",
      });
      return;
    }

    addMsg({
      role: "user",
      text: `Hire ${service.name} for ${formatUnits(service.pricePerCall, 6)} USDC`,
    });

    setLoading(true);

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const address = wallet.address as `0x${string}`;

      // Check identity
      addMsg({ role: "system", text: "Checking your identity..." });
      const balance = await client.readContract({
        address: CONTRACTS.IDENTITY_REGISTRY,
        abi: ERC8004_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      if (balance === 0n) {
        addMsg({ role: "system", text: "Minting your agent identity NFT..." });
        const mintHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{ from: address, to: CONTRACTS.IDENTITY_REGISTRY, data: "0x1aa3a008" }],
        });
        await client.waitForTransactionReceipt({ hash: mintHash as `0x${string}` });
        addMsg({ role: "system", text: "Identity minted!" });
      }

      // Find buyer agent ID
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
        } catch {}
      }

      const amount = service.pricePerCall;
      const paymentToken = service.paymentToken as `0x${string}`;

      // Approve
      addMsg({ role: "system", text: "Approving payment..." });
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.NASTAR_ESCROW, amount],
      });
      const appHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: paymentToken, data: approveData }],
      });
      await client.waitForTransactionReceipt({ hash: appHash as `0x${string}` });

      // Create deal with autoConfirm
      addMsg({ role: "system", text: "Creating deal + locking payment in escrow..." });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
      const dealData = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "createDeal",
        args: [
          BigInt(serviceIndex),
          buyerAgentId,
          service.agentId,
          paymentToken,
          amount,
          `Hired via Nastar chat: ${service.name}`,
          deadline,
          true, // autoConfirm
        ],
      });
      const dealHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: CONTRACTS.NASTAR_ESCROW, data: dealData }],
      });
      await client.waitForTransactionReceipt({ hash: dealHash as `0x${string}` });

      addMsg({
        role: "assistant",
        text: `Done! Agent "${service.name}" has been hired for ${formatUnits(amount, 6)} USDC. Payment is in escrow and will auto-release when the agent delivers. You can dispute within 3 days if unhappy.`,
        txHash: dealHash as string,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addMsg({
        role: "assistant",
        text: `Something went wrong: ${msg.slice(0, 150)}`,
      });
    }

    setLoading(false);
  }

  // Gate: require wallet connection
  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] px-4">
        <div className="max-w-md text-center">
          {/* Agent avatar */}
          <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-green-200 flex items-center justify-center mx-auto mb-6">
            <span className="text-[#F4C430] font-bold text-4xl">N</span>
          </div>

          <h2 className="text-xl font-bold text-[#F5F5F5] mb-2">
            Let's Get You Started
          </h2>
          <p className="text-[#A1A1A1]/60 text-sm mb-8 leading-relaxed">
            Nastar works with AI agents to serve you best.
            Connect your wallet to begin your conversation.
            Your wallet is used for identity and payments on Celo.
          </p>

          <button
            onClick={login}
            className="w-full py-3 rounded-xl gradient-btn font-semibold hover:shadow-[0_0_15px_#F4C430] transition text-sm"
          >
            Connect Wallet
          </button>

          <p className="text-[#A1A1A1]/40 text-xs mt-4">
            Supports email, Google, or any Celo wallet. MiniPay users connect automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "gradient-btn"
                    : msg.role === "system"
                    ? "bg-white/5 text-[#A1A1A1] text-sm italic"
                    : "bg-white/10 text-[#F5F5F5]"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Service cards in chat */}
                {msg.services && (
                  <div className="mt-3 space-y-2">
                    {msg.services.map((svc, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-[#0A0A0A]/30 border border-[#F4C430]/30"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-[#F5F5F5] text-sm">
                            {svc.name}
                          </span>
                          <span className="text-[#F4C430] text-sm font-medium">
                            {formatUnits(svc.pricePerCall, 6)} USDC
                          </span>
                        </div>
                        <p className="text-[#A1A1A1] text-xs mb-2 line-clamp-2">
                          {svc.description}
                        </p>
                        <button
                          onClick={() => handleHire(svc, i)}
                          disabled={loading}
                          className="w-full py-1.5 rounded-lg gradient-btn text-sm font-medium hover:shadow-[0_0_15px_#F4C430] disabled:opacity-50 transition"
                        >
                          Hire Agent
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* TX link */}
                {msg.txHash && (
                  <a
                    href={`https://sepolia.celoscan.io/tx/${msg.txHash}`}
                    target="_blank"
                    className="inline-block mt-2 text-xs text-[#F4C430] hover:underline"
                  >
                    View on CeloScan →
                  </a>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/10 rounded-2xl px-4 py-3 text-[#A1A1A1]">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}

          {!authenticated && messages.length > 1 && (
            <div className="flex justify-center">
              <button
                onClick={login}
                className="px-6 py-2.5 rounded-xl gradient-btn font-medium hover:shadow-[0_0_15px_#F4C430] transition"
              >
                Sign In with Email
              </button>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#F4C430]/30 bg-white/50 backdrop-blur-xl px-4 py-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="What do you need an agent to do?"
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-[#F4C430]/30 text-white placeholder-white/30 focus:outline-none focus:border-green-500/50"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl gradient-btn font-medium hover:shadow-[0_0_15px_#F4C430] disabled:opacity-50 transition"
          >
            Send
          </button>
        </div>
        <p className="max-w-2xl mx-auto text-xs text-[#A1A1A1]/40 mt-2 text-center">
          Try: "I need data scraping" or "find me an AI agent"
        </p>
      </div>
    </div>
  );
}
