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
  const [showWalletPanel, setShowWalletPanel] = useState(false);
  const [walletMode, setWalletMode] = useState<"idle" | "deposit" | "withdraw">("idle");
  const [copied, setCopied] = useState(false);
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawToken, setWithdrawToken] = useState("cUSD");
  const [withdrawing, setWithdrawing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
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
    const agentId = hireId || searchParams.get("agent");
    const agentName = hireName || searchParams.get("name");
    if (agentId && agentName) {
      setPrefilled(true);

      // Find matching service for this agent
      const matchedService = services.find((s) => String(s.agentId) === String(agentId));
      const matchedIndex = matchedService ? services.indexOf(matchedService) : -1;

      const hireMsg = `I want to hire ${agentName}`;
      addMsg({ role: "user", text: hireMsg });

      if (matchedService) {
        // Show service info + hire button directly
        const price = formatUnits(matchedService.pricePerCall, 18);
        addMsg({
          role: "assistant",
          text: `**${agentName}** — ${matchedService.description || "AI agent on Nastar"}\n\nFee: **${price} USDC** per call\nPayment: On-chain escrow (auto-releases on delivery)\nDispute window: 3 days\n\nReady to hire? Click below or type "yes" to proceed.`,
          services: [matchedService],
          serviceIndex: matchedIndex,
        });
      } else {
        // No on-chain service found — ask butler
        setLoading(true);
        fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: hireMsg }],
            services: services.map((s, i) => `#${i}: "${s.name}" (Agent ${s.agentId}) — ${s.description}. ${formatUnits(s.pricePerCall, 18)} USDC`).join("\n"),
            wallet: wallets?.[0]?.address || "anonymous",
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            addMsg({ role: "assistant", text: data.reply || `I'll help you hire ${agentName}. Let me look up their services.` });
            setLoading(false);
          })
          .catch(() => {
            addMsg({ role: "assistant", text: `I'll help you hire ${agentName}. Connect your wallet to get started.` });
            setLoading(false);
          });
      }
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
                <button
                  onClick={() => setShowWalletPanel(true)}
                  className="mb-6 w-full max-w-lg p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-[#F4C430]/30 transition text-left"
                >
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
                      <span className="text-[#A1A1A1]/40">Tap to deposit &amp; manage wallet</span>
                    )}
                  </div>
                </button>
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
                <div className={`chat-md text-sm leading-relaxed ${msg.role === "user" ? "text-[#0A0A0A]" : "text-[#E5E5E5]"}`}>
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
          {nastarWallet && (
            <button
              onClick={() => setShowWalletPanel(true)}
              className="px-3 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[#F4C430] hover:border-[#F4C430]/40 transition"
              title="Wallet"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
              </svg>
            </button>
          )}
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
            onClick={() => {
              if (isRecording) {
                recognitionRef.current?.stop();
                setIsRecording(false);
                return;
              }
              const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
              if (!SR) { alert("Speech recognition not supported in this browser"); return; }
              const recognition = new SR();
              recognition.lang = "en-US";
              recognition.interimResults = false;
              recognition.continuous = false;
              recognition.onresult = (e: any) => {
                const transcript = e.results[0][0].transcript;
                setInput((prev: string) => prev ? prev + " " + transcript : transcript);
                setIsRecording(false);
              };
              recognition.onerror = () => setIsRecording(false);
              recognition.onend = () => setIsRecording(false);
              recognitionRef.current = recognition;
              recognition.start();
              setIsRecording(true);
            }}
            className={`p-3 rounded-xl border transition ${isRecording ? "bg-red-500/20 border-red-500/40 text-red-400 animate-pulse" : "bg-white/[0.04] border-white/[0.08] text-[#A1A1A1] hover:text-[#F4C430] hover:border-[#F4C430]/30"}`}
            title={isRecording ? "Stop recording" : "Voice input"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {isRecording ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] disabled:opacity-30 transition"
          >
            Send
          </button>
        </div>
      </div>

      {/* Wallet Panel Overlay */}
      {showWalletPanel && nastarWallet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowWalletPanel(false); setWalletMode("idle"); }} />
          <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-2xl bg-[#111] border border-white/[0.1] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  <img src="/nastar-mascot.png" alt="Nastar" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-[#F5F5F5] text-sm font-semibold">Nastar Wallet</p>
                  <p className="text-[#A1A1A1]/60 text-xs font-mono flex items-center gap-1">
                    {nastarWallet.slice(0, 6)}...{nastarWallet.slice(-4)}
                    <button
                      onClick={() => { navigator.clipboard.writeText(nastarWallet); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="text-[#A1A1A1]/40 hover:text-[#F4C430] transition"
                    >
                      {copied ? "✓" : "⎘"}
                    </button>
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowWalletPanel(false); setWalletMode("idle"); }} className="text-[#A1A1A1]/40 hover:text-white transition text-lg">✕</button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 px-5 py-4">
              <button
                onClick={() => setWalletMode(walletMode === "deposit" ? "idle" : "deposit")}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${walletMode === "deposit" ? "bg-[#F4C430]/20 border-[#F4C430]/40 text-[#F4C430]" : "bg-[#F4C430]/10 border-[#F4C430]/20 text-[#F4C430] hover:bg-[#F4C430]/20"}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
                <span className="text-xs font-medium">Deposit</span>
              </button>
              <button
                onClick={() => setWalletMode(walletMode === "withdraw" ? "idle" : "withdraw")}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${walletMode === "withdraw" ? "bg-red-500/20 border-red-500/40 text-red-400" : "bg-white/[0.04] border-white/[0.08] text-[#A1A1A1] hover:text-white hover:border-white/[0.15]"}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
                <span className="text-xs font-medium">Withdraw</span>
              </button>
            </div>

            {/* Deposit Mode */}
            {walletMode === "deposit" && (
              <div className="px-5 pb-4">
                <div className="p-4 rounded-xl bg-[#F4C430]/5 border border-[#F4C430]/20">
                  <p className="text-[#F4C430] text-xs font-medium mb-2">Send stablecoins on Celo to:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[#F5F5F5] text-xs font-mono break-all">{nastarWallet}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(nastarWallet); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="px-2 py-1 rounded-lg bg-[#F4C430]/20 text-[#F4C430] text-xs hover:bg-[#F4C430]/30 transition"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[#A1A1A1]/40 text-[10px] mt-2">Supported: cUSD, USDC, USDT on Celo (Chain ID: 42220)</p>
                </div>
              </div>
            )}

            {/* Withdraw Mode */}
            {walletMode === "withdraw" && (
              <div className="px-5 pb-4 space-y-3">
                <div>
                  <label className="text-[#A1A1A1]/60 text-xs mb-1 block">Token</label>
                  <div className="flex gap-2">
                    {["cUSD", "USDC", "USDT", "CELO"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setWithdrawToken(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${withdrawToken === t ? "bg-[#F4C430]/20 text-[#F4C430] border border-[#F4C430]/40" : "bg-white/[0.04] text-[#A1A1A1] border border-white/[0.08] hover:text-white"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[#A1A1A1]/60 text-xs mb-1 block">Amount</label>
                  <div className="flex gap-2">
                    <input
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#F4C430]/30"
                    />
                    <button
                      onClick={() => setWithdrawAmount(walletBalances[withdrawToken] || "0")}
                      className="px-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#A1A1A1] text-xs hover:text-[#F4C430] transition"
                    >
                      MAX
                    </button>
                  </div>
                  <p className="text-[#A1A1A1]/30 text-[10px] mt-1">Available: {parseFloat(walletBalances[withdrawToken] || "0").toFixed(4)} {withdrawToken}</p>
                </div>
                <div>
                  <label className="text-[#A1A1A1]/60 text-xs mb-1 block">To Address</label>
                  <input
                    value={withdrawTo}
                    onChange={(e) => setWithdrawTo(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] text-sm font-mono focus:outline-none focus:border-[#F4C430]/30"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!withdrawTo || !withdrawAmount || withdrawing) return;
                    setWithdrawing(true);
                    try {
                      const decimals = withdrawToken === "USDC" || withdrawToken === "USDT" ? 6 : 18;
                      const raw = BigInt(Math.floor(parseFloat(withdrawAmount) * (10 ** decimals))).toString();
                      const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";
                      const r = await fetch(`${API}/v1/wallet/withdraw`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ownerAddress: wallets[0]?.address, to: withdrawTo, token: withdrawToken, amount: raw }),
                      });
                      const d = await r.json();
                      if (d.success) {
                        setShowWalletPanel(false);
                        setWalletMode("idle");
                        addMsg({ role: "assistant", text: `Withdrawn ${d.amount} ${d.token} to ${d.to.slice(0, 6)}...${d.to.slice(-4)}.\nTX: ${d.txHash}` });
                        setWithdrawTo(""); setWithdrawAmount("");
                        // Refresh balances
                        const balRes = await fetch(`${API}/v1/wallet/balance?ownerAddress=${wallets[0]?.address}`);
                        const balData = await balRes.json();
                        if (balData.balances) setWalletBalances(balData.balances);
                      } else {
                        addMsg({ role: "assistant", text: `Withdraw failed: ${d.error}` });
                      }
                    } catch (e: any) {
                      addMsg({ role: "assistant", text: `Withdraw error: ${e.message}` });
                    }
                    setWithdrawing(false);
                  }}
                  disabled={!withdrawTo || !withdrawAmount || withdrawing}
                  className="w-full py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/30 transition disabled:opacity-30"
                >
                  {withdrawing ? "Sending..." : `Withdraw ${withdrawAmount || "0"} ${withdrawToken}`}
                </button>
              </div>
            )}

            {/* Assets */}
            <div className="px-5 pb-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[#A1A1A1]/60 text-xs font-medium">Assets</p>
                <span className="text-[#A1A1A1]/30 text-[10px]">Celo Network</span>
              </div>
            </div>
            <div className="px-5 pb-5 space-y-1">
              {[
                { symbol: "cUSD", name: "Celo Dollar", logo: "/tokens/cusd.svg" },
                { symbol: "USDC", name: "USD Coin", logo: "/tokens/usdc.svg" },
                { symbol: "USDT", name: "Tether", logo: "/tokens/usdt.svg" },
                { symbol: "CELO", name: "CELO", logo: "/tokens/celo.svg" },
              ].map((token) => {
                const bal = parseFloat(walletBalances[token.symbol] || "0");
                return (
                  <div key={token.symbol} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/[0.02] transition">
                    <div className="flex items-center gap-3">
                      <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full" />
                      <div>
                        <p className="text-[#F5F5F5] text-sm font-medium">{token.name}</p>
                        <p className="text-[#A1A1A1]/40 text-xs">{token.symbol}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[#F5F5F5] text-sm font-medium">{token.symbol === "CELO" ? bal.toFixed(4) : bal.toFixed(2)} {token.symbol}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
