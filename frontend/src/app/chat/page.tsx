"use client";
export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, Suspense } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { createPublicClient, http, formatUnits, encodeFunctionData } from "viem";
import PageTitle from "@/components/PageTitle";
import ReactMarkdown from "react-markdown";
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
  const [nastarWallet, setNastarWallet] = useState<string | null>(null);
  const [walletBalances, setWalletBalances] = useState<Record<string, string>>({});
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  // Auto-create/fetch Nastar Wallet when user connects
  useEffect(() => {
    if (!wallets.length) return;
    const address = wallets[0].address;
    const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";
    
    (async () => {
      try {
        // Create or get existing wallet
        const createRes = await fetch(`${API}/v1/wallet/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerAddress: address }),
        });
        const data = await createRes.json();
        if (data.walletAddress) setNastarWallet(data.walletAddress);

        // Fetch balances
        const balRes = await fetch(`${API}/v1/wallet/balance?ownerAddress=${address}`);
        const balData = await balRes.json();
        if (balData.balances) setWalletBalances(balData.balances);
      } catch {}
    })();
  }, [wallets]);

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

  // Handle "Hire this Agent" redirect from agent profile page
  useEffect(() => {
    if (prefilled) return;
    const hireId = searchParams.get("hire");
    const hireName = searchParams.get("name");
    // Legacy support
    const agentId = hireId || searchParams.get("agent");
    const agentName = hireName || searchParams.get("name");
    if (agentId && agentName) {
      setPrefilled(true);
      // Auto-send hire message to butler
      const hireMsg = `I want to hire ${agentName}`;
      addMsg({ role: "user", text: hireMsg });
      setLoading(true);
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: hireMsg }],
          services: services.map((s, i) => `#${i}: "${s.name}" (Agent ${s.agentId}) — ${s.description}`).join("\n"),
          wallet: wallets?.[0]?.address || "anonymous",
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          addMsg({ role: "assistant", text: data.reply || "Let me help you hire this agent." });
          setLoading(false);
        })
        .catch(() => {
          addMsg({ role: "assistant", text: `I'll help you hire ${agentName}. Connect your wallet to get started, then I'll handle the escrow and payment.` });
          setLoading(false);
        });
    }
  }, [searchParams, prefilled, services]);

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

      // Only show service cards if NOT a cached FAQ answer and service name is specific enough
      let mentionedServices: Service[] = [];
      if (!data.cached) {
        mentionedServices = services.filter((s) => {
          if (s.name.length < 4) return false; // skip short names like "tes"
          const pattern = new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
          return pattern.test(reply);
        });
      }

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

    const amount = service.pricePerCall;
    addMsg({ role: "user", text: `Hire ${service.name} for ${formatUnits(amount, 18)} USDC` });
    setLoading(true);

    try {
      const address = wallets[0].address;
      const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

      // Step 1: Ensure user has a Nastar Wallet
      addMsg({ role: "system", text: "Setting up your Nastar Wallet..." });
      const createRes = await fetch(`${API}/v1/wallet/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAddress: address }),
      });
      const walletData = await createRes.json();
      if (!walletData.success) throw new Error(walletData.error || "Wallet creation failed");

      const nastarWallet = walletData.walletAddress;

      // Step 2: Check balance
      const balRes = await fetch(`${API}/v1/wallet/balance?ownerAddress=${address}`);
      const balData = await balRes.json();
      const available = parseFloat(balData.balances?.cUSD || "0") + parseFloat(balData.balances?.USDC || "0") + parseFloat(balData.balances?.USDT || "0");
      const needed = parseFloat(formatUnits(amount, 18));

      if (available < needed) {
        addMsg({
          role: "assistant",
          text: `Insufficient balance in your Nastar Wallet. You need ${needed} but have ${available.toFixed(2)}.\n\nDeposit stablecoins (cUSD, USDC, USDT) to:\n\`${nastarWallet}\`\n\nThen try hiring again.`,
        });
        setLoading(false);
        return;
      }

      // Step 3: Execute hire — server handles approve + createDeal automatically
      addMsg({ role: "system", text: "Executing hire — no approval needed..." });
      const hireRes = await fetch(`${API}/v1/wallet/hire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          serviceIndex,
          sellerAgentId: Number(service.agentId),
          paymentToken: service.paymentToken,
          amount: amount.toString(),
          serviceName: service.name,
        }),
      });
      const hireData = await hireRes.json();

      if (!hireRes.ok) {
        if (hireData.walletAddress) {
          addMsg({
            role: "assistant",
            text: `${hireData.error}\n\nDeposit to: \`${hireData.walletAddress}\``,
          });
        } else {
          throw new Error(hireData.error || "Hire failed");
        }
        setLoading(false);
        return;
      }

      addMsg({
        role: "assistant",
        text: `Done! "${service.name}" hired for ${formatUnits(amount, 18)} USDC. Payment is in escrow — auto-releases on delivery. You can dispute within 3 days.\n\nNo popups, no approvals. That's Nastar.`,
        txHash: hireData.dealTxHash || "",
      });
    } catch (err: unknown) {
      addMsg({ role: "assistant", text: `Error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}` });
    }

    setLoading(false);
  }

  // Suggestions — designed to showcase Nastar's features
  const suggestions = [
    { text: "What is Nastar and how does it work?", icon: "💡" },
    { text: "How does the AI dispute judge resolve conflicts?", icon: "⚖️" },
    { text: "Show me how escrow protects buyers and sellers", icon: "🔐" },
    { text: "What stablecoins can I use on Nastar?", icon: "💱" },
    { text: "How do I launch my own AI agent?", icon: "🚀" },
    { text: "How is Nastar different from Virtuals ACP?", icon: "🤔" },
  ];

  // No wallet gate — anyone can chat. Hiring requires wallet.

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-[#0A0A0A]">
      <PageTitle title="Chat" />
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {/* Empty state with suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
              <div className="w-20 h-20 rounded-full overflow-hidden mb-4 shadow-[0_0_20px_rgba(244,196,48,0.2)]">
                <img src="/nastar-mascot.png" alt="Nastar" className="w-full h-full object-cover" />
              </div>
              <h3 className="text-[#F5F5F5] font-semibold text-lg mb-1">Nastar Butler</h3>
              <p className="text-[#A1A1A1] text-sm mb-2">Your guide to the agent marketplace</p>
              <p className="text-[#A1A1A1]/40 text-xs mb-4 max-w-sm text-center">
                Ask about how Nastar works, explore features, or get help hiring AI agents with on-chain escrow.
              </p>
              {nastarWallet && (
                <div className="mb-6 w-full max-w-lg p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#A1A1A1] text-xs">Your Nastar Wallet</span>
                    <span className="text-[#F4C430] text-xs font-mono">{nastarWallet.slice(0, 6)}...{nastarWallet.slice(-4)}</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {Object.entries(walletBalances).filter(([k]) => k !== "CELO").map(([symbol, bal]) => (
                      <span key={symbol} className="text-[#A1A1A1]/70">
                        {parseFloat(bal).toFixed(2)} <span className="text-[#F4C430]/60">{symbol}</span>
                      </span>
                    ))}
                    {Object.keys(walletBalances).filter(k => k !== "CELO").length === 0 && (
                      <span className="text-[#A1A1A1]/40">No stablecoins yet — deposit to hire agents</span>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggestions.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[#A1A1A1] text-sm text-left hover:text-[#F4C430] hover:border-[#F4C430]/30 hover:bg-[#F4C430]/[0.03] transition"
                  >
                    <span className="text-base shrink-0">{s.icon}</span>
                    <span>{s.text}</span>
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
                <div className="w-7 h-7 rounded-lg overflow-hidden mr-2 mt-1 shrink-0">
                  <img src="/nastar-mascot.png" alt="Nastar" className="w-full h-full object-cover" />
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
                <div className="prose prose-invert prose-sm max-w-none prose-table:text-xs prose-td:px-2 prose-td:py-1 prose-th:px-2 prose-th:py-1 prose-th:text-[#F4C430] prose-th:font-medium prose-table:border-collapse prose-td:border prose-td:border-white/10 prose-th:border prose-th:border-white/10">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>

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
                  <a href={`https://celoscan.io/tx/${msg.txHash}`} target="_blank"
                    className="inline-block mt-2 text-xs text-[#F4C430] hover:underline">
                    View on CeloScan
                  </a>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start">
              <div className="w-7 h-7 rounded-lg overflow-hidden mr-2 mt-1 shrink-0">
                <img src="/nastar-mascot.png" alt="Nastar" className="w-full h-full object-cover" />
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
