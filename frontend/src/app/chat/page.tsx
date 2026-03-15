"use client";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, Suspense } from "react";
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    addMsg({ role: "user", text: userText });
    setLoading(true);

    try {
      const chatHistory = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-6)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));
      chatHistory.push({ role: "user", content: userText });

      const servicesContext = services.length > 0
        ? services.map((s, i) => `#${i}: "${s.name}" (Agent ${s.agentId}) — ${s.description}. ${formatUnits(s.pricePerCall, 18)} USDC`).join("\n")
        : "No agents registered yet.";

      const wallet = wallets?.[0]?.address || "anonymous";
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory, services: servicesContext, wallet }),
      });

      const data = await res.json();
      const reply = data.reply || "Something went wrong. Try again.";

      const mentionedServices = services.filter((s) =>
        reply.toLowerCase().includes(s.name.toLowerCase())
      );

      addMsg({
        role: "assistant",
        text: reply,
        services: mentionedServices.length > 0 ? mentionedServices : undefined,
      });
    } catch {
      const matched = services.filter((s) => {
        const q = userText.toLowerCase();
        return s.name.toLowerCase().includes(q) || q.split(" ").some((w) => w.length > 2 && s.description.toLowerCase().includes(w));
      });
      addMsg({
        role: "assistant",
        text: matched.length > 0 ? `Found ${matched.length} agent${matched.length > 1 ? "s" : ""} for you:` : "Here are all available agents:",
        services: matched.length > 0 ? matched : services.length > 0 ? services : undefined,
      });
    }

    setLoading(false);
    inputRef.current?.focus();
  }

  async function handleHire(service: Service, serviceIndex: number) {
    if (!wallets.length) {
      addMsg({ role: "assistant", text: "Connect your wallet first to hire agents." });
      return;
    }

    addMsg({ role: "user", text: `Hire ${service.name} for ${formatUnits(service.pricePerCall, 6)} USDC` });
    setLoading(true);

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const address = wallet.address as `0x${string}`;

      addMsg({ role: "system", text: "Checking identity..." });
      const balance = await client.readContract({
        address: CONTRACTS.IDENTITY_REGISTRY, abi: ERC8004_ABI, functionName: "balanceOf", args: [address],
      });

      if (balance === 0n) {
        addMsg({ role: "system", text: "Minting agent identity NFT..." });
        const mintHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: address, to: CONTRACTS.IDENTITY_REGISTRY, data: "0x1aa3a008" }] });
        await client.waitForTransactionReceipt({ hash: mintHash as `0x${string}` });
      }

      let buyerAgentId = 0n;
      for (let i = 0n; i <= 100n; i++) {
        try {
          const owner = await client.readContract({
            address: CONTRACTS.IDENTITY_REGISTRY,
            abi: [{ type: "function", name: "ownerOf", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" }] as const,
            functionName: "ownerOf", args: [i],
          });
          if (owner.toLowerCase() === address.toLowerCase()) { buyerAgentId = i; break; }
        } catch {}
      }

      const amount = service.pricePerCall;
      const paymentToken = service.paymentToken as `0x${string}`;

      addMsg({ role: "system", text: "Approving payment..." });
      const approveData = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [CONTRACTS.NASTAR_ESCROW, amount] });
      const appHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: address, to: paymentToken, data: approveData }] });
      await client.waitForTransactionReceipt({ hash: appHash as `0x${string}` });

      addMsg({ role: "system", text: "Creating deal + escrowing payment..." });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
      const dealData = encodeFunctionData({
        abi: ESCROW_ABI, functionName: "createDeal",
        args: [BigInt(serviceIndex), buyerAgentId, service.agentId, paymentToken, amount, `Hired via Nastar: ${service.name}`, deadline, true],
      });
      const dealHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: address, to: CONTRACTS.NASTAR_ESCROW, data: dealData }] });
      await client.waitForTransactionReceipt({ hash: dealHash as `0x${string}` });

      addMsg({
        role: "assistant",
        text: `Done! "${service.name}" hired for ${formatUnits(amount, 18)} USDC. Payment in escrow — auto-releases on delivery. You can dispute within 3 days.`,
        txHash: dealHash as string,
      });
    } catch (err: unknown) {
      addMsg({ role: "assistant", text: `Error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}` });
    }

    setLoading(false);
  }

  // Suggestions
  const suggestions = [
    "I need data about Celo validators",
    "Find me a smart contract auditor",
    "Scrape a website for me",
    "Write a tweet thread about DeFi",
  ];

  // Gate: require wallet
  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-56px)] bg-[#0A0A0A] px-4">
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F4C430] to-[#FF9F1C] flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(244,196,48,0.3)]">
            <span className="text-[#0A0A0A] font-bold text-2xl">N</span>
          </div>
          <h2 className="text-xl font-bold text-[#F5F5F5] mb-2">Nastar</h2>
          <p className="text-[#A1A1A1] text-sm mb-8">
            AI-powered agent discovery. Tell me what you need, I'll find and hire the right agent.
          </p>
          <button onClick={login} className="w-full py-3 rounded-xl gradient-btn font-semibold hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition text-sm">
            Connect Wallet to Chat
          </button>
          <p className="text-[#A1A1A1]/40 text-xs mt-4">Email, Google, or any Celo wallet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-[#0A0A0A]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {/* Empty state with suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
              <div className="w-20 h-20 rounded-full overflow-hidden mb-4 shadow-[0_0_20px_rgba(244,196,48,0.2)]">
                <img src="/nastar-mascot.png" alt="Nastar" className="w-full h-full object-cover" />
              </div>
              <h3 className="text-[#F5F5F5] font-semibold mb-1">What do you need done?</h3>
              <p className="text-[#A1A1A1] text-sm mb-6">I'll find the right agent and handle the deal.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="px-4 py-2.5 rounded-xl glass-card text-[#A1A1A1] text-sm text-left hover:text-[#F4C430] hover:border-[#F4C430]/50 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in`}>
              {/* Avatar for assistant */}
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#F4C430] to-[#FF9F1C] flex items-center justify-center mr-2 mt-1 shrink-0">
                  <span className="text-[#0A0A0A] font-bold text-xs">N</span>
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#F4C430] text-[#0A0A0A] rounded-br-md"
                    : msg.role === "system"
                    ? "bg-transparent text-[#A1A1A1]/60 text-xs italic px-0 py-1"
                    : "bg-white/[0.06] text-[#F5F5F5] border border-white/[0.08] rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Service cards */}
                {msg.services && (
                  <div className="mt-3 space-y-2">
                    {msg.services.map((svc, i) => (
                      <div key={i} className="p-3 rounded-xl bg-[#0A0A0A]/50 border border-[#F4C430]/20">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-[#F5F5F5] text-sm">{svc.name}</span>
                          <span className="text-[#F4C430] text-xs font-medium">{formatUnits(svc.pricePerCall, 18)} USDC</span>
                        </div>
                        <p className="text-[#A1A1A1] text-xs mb-2 line-clamp-2">{svc.description}</p>
                        <button
                          onClick={() => handleHire(svc, i)}
                          disabled={loading}
                          className="w-full py-1.5 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] disabled:opacity-50 transition"
                        >
                          Hire — {formatUnits(svc.pricePerCall, 18)} USDC
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {msg.txHash && (
                  <a href={`https://sepolia.celoscan.io/tx/${msg.txHash}`} target="_blank"
                    className="inline-block mt-2 text-xs text-[#F4C430] hover:underline">
                    View on CeloScan
                  </a>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#F4C430] to-[#FF9F1C] flex items-center justify-center mr-2 mt-1 shrink-0">
                <span className="text-[#0A0A0A] font-bold text-xs">N</span>
              </div>
              <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#F4C430]/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-[#F4C430]/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-[#F4C430]/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEnd} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-white/[0.06] bg-[#0A0A0A] px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="What do you need an agent to do?"
            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/40 focus:outline-none focus:border-[#F4C430]/40 transition text-sm"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] disabled:opacity-30 transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
