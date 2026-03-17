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
  CELO_TOKENS,
  getTokenByAddress,
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
  agentLink?: { id: string; name: string };

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
  const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";
  const [agentMode, setAgentMode] = useState<{ id: string; name: string; template_id?: string; description?: string } | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<{ id: string; title: string; date: number }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `chat-${Date.now()}`);
  const [selectedPayToken, setSelectedPayToken] = useState(CELO_TOKENS.USDm); // default cUSD
  const PAY_TOKENS = [
    { symbol: "cUSD", address: CELO_TOKENS.USDm, decimals: 18, logo: "/tokens/cusd.svg" },
    { symbol: "USDC", address: CELO_TOKENS.USDC, decimals: 6, logo: "/tokens/usdc.svg" },
    { symbol: "USDT", address: CELO_TOKENS.USDT, decimals: 6, logo: "/tokens/usdt.svg" },
  ];
  const recognitionRef = useRef<any>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();

  // ── Chat History (localStorage) ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nastar-chat-sessions");
      if (stored) setChatSessions(JSON.parse(stored));
    } catch {}
  }, []);

  // Save messages to current session whenever they change
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      // Save message data (strip services to save space)
      const slim = messages.map(m => ({ id: m.id, role: m.role, text: m.text }));
      localStorage.setItem(`nastar-chat-${currentSessionId}`, JSON.stringify(slim));

      // Update session list
      const firstUserMsg = messages.find(m => m.role === "user");
      const title = firstUserMsg?.text?.slice(0, 40) || "New chat";
      setChatSessions(prev => {
        const existing = prev.find(s => s.id === currentSessionId);
        let updated: typeof prev;
        if (existing) {
          updated = prev.map(s => s.id === currentSessionId ? { ...s, title } : s);
        } else {
          updated = [{ id: currentSessionId, title, date: Date.now() }, ...prev];
        }
        // Keep last 20 sessions
        const trimmed = updated.slice(0, 20);
        localStorage.setItem("nastar-chat-sessions", JSON.stringify(trimmed));
        return trimmed;
      });
    } catch {}
  }, [messages, currentSessionId]);

  function loadSession(sessionId: string) {
    try {
      const data = localStorage.getItem(`nastar-chat-${sessionId}`);
      if (data) {
        setMessages(JSON.parse(data));
        setCurrentSessionId(sessionId);
        setShowHistory(false);
      }
    } catch {}
  }

  function startNewChat() {
    setMessages([]);
    setCurrentSessionId(`chat-${Date.now()}`);
    setPrefilled(false);
    setShowHistory(false);
  }

  function deleteSession(sessionId: string) {
    localStorage.removeItem(`nastar-chat-${sessionId}`);
    setChatSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      localStorage.setItem("nastar-chat-sessions", JSON.stringify(updated));
      return updated;
    });
    if (currentSessionId === sessionId) startNewChat();
  }

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
    const mode = searchParams.get("mode");

    // Agent work mode — direct chat with agent personality
    if (mode === "work" && agentId && agentName) {
      setPrefilled(true);
      setAgentMode({ id: agentId, name: agentName });
      addMsg({
        role: "assistant",
        text: `Hi! I'm **${agentName}**. Your deal is active and payment is secured in escrow.\n\nDescribe your task and I'll get to work. Once I deliver, you'll receive the output here with proof-of-work.`,
      });
      return;
    }

    if (agentId && agentName) {
      setPrefilled(true);

      // Find ALL services for this specific agent ID — no name searching
      const agentServices = services.filter((s) => String(s.agentId) === String(agentId));

      if (agentServices.length > 0) {
        // Build service list
        const serviceList = agentServices.map((s) => {
          const price = formatUnits(s.pricePerCall, 18);
          return `- **${s.name}** — ${s.description || "Service"}\n  Price: **${price} USD**`;
        }).join("\n");

        addMsg({
          role: "assistant",
          text: `**${agentName}** (Agent #${agentId})\n\n${agentServices.length > 1 ? "Available services:" : "Service:"}\n\n${serviceList}\n\nPayment is secured in on-chain escrow. Auto-releases on delivery. 3-day dispute window.\n\nClick below to hire:`,
          services: agentServices,
          serviceIndex: services.indexOf(agentServices[0]),
        });
      } else {
        // Agent exists but no on-chain services yet
        addMsg({
          role: "assistant",
          text: `**${agentName}** (Agent #${agentId}) doesn't have on-chain services registered yet.\n\nYou can still chat with them directly to discuss your needs.`,
          agentLink: { id: agentId, name: agentName },
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
        body: JSON.stringify({
          messages: chatHistory,
          services: servicesContext,
          wallet,
          ...(agentMode ? { agentContext: { name: agentMode.name, template_id: agentMode.template_id, description: agentMode.description } } : {}),
        }),
      });

      const data = await res.json();
      let reply = data.reply || "Something went wrong. Try again.";

      // Execute any [ACTION:...] commands in agent response
      const actionMatch = reply.match(/\[ACTION:(\w+):(.*?)\]/);
      if (actionMatch && agentMode) {
        const [fullMatch, actionType, actionParams] = actionMatch;
        const params = actionParams.split(":");
        reply = reply.replace(fullMatch, "").trim();

        // Show the text part first
        if (reply) addMsg({ role: "assistant", text: reply });

        // Execute the action
        addMsg({ role: "system", text: `Executing ${actionType}...` });
        try {
          const actionRes = await fetch("/api/agent-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: actionType, params, ownerAddress: wallets?.[0]?.address }),
          });
          const actionData = await actionRes.json();
          if (actionData.success || actionData.balances) {
            const resultText = actionType === "balance"
              ? `Wallet balances:\n${Object.entries(actionData.balances || {}).map(([t, a]) => `• ${t}: ${a}`).join("\n")}`
              : actionType === "swap"
              ? `Swap executed! ${actionData.fromAmount} ${actionData.fromToken} → ${actionData.toAmount} ${actionData.toToken}\nTX: ${actionData.txHash || "confirmed"}`
              : actionType === "send"
              ? `Sent ${actionData.amount} ${actionData.token} to ${actionData.to}\nTX: ${actionData.txHash || "confirmed"}`
              : `Action completed: ${JSON.stringify(actionData).slice(0, 200)}`;
            addMsg({ role: "assistant", text: resultText, txHash: actionData.txHash });
          } else {
            addMsg({ role: "assistant", text: `Action failed: ${actionData.error || "Unknown error"}` });
          }
        } catch (e) {
          addMsg({ role: "assistant", text: `Action failed: ${e instanceof Error ? e.message : "Network error"}` });
        }
        setLoading(false);
        inputRef.current?.focus();
        return;
      }

      // Only show service cards if NOT a cached FAQ answer and service name is specific enough
      let mentionedServices: Service[] = [];
      if (!data.cached) {
        mentionedServices = services.filter((s) => {
          if (s.name.length < 4) return false; // skip short names like "tes"
          const pattern = new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
          return pattern.test(reply);
        });
        // Deduplicate by agentId
        const seen = new Set<string>();
        mentionedServices = mentionedServices.filter((s) => {
          const key = String(s.agentId);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
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
    const payToken = PAY_TOKENS.find(t => t.address.toLowerCase() === selectedPayToken.toLowerCase()) || PAY_TOKENS[0];
    addMsg({ role: "user", text: `Hire ${service.name} for ${formatUnits(amount, 18)} ${payToken.symbol}` });
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
          paymentToken: selectedPayToken,
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
        text: `Done! "${service.name}" hired for ${formatUnits(amount, 18)} ${payToken.symbol}. Payment is locked in escrow.\n\n**What happens next:**\n1. Chat with the agent to describe your task\n2. Agent delivers the work with proof\n3. Payment auto-releases after delivery\n4. You can dispute within 3 days if unsatisfied`,
        txHash: hireData.dealTxHash || "",
        agentLink: { id: String(service.agentId), name: service.name },
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
      {/* Chat Header */}
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHistory(!showHistory)} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition" title="Chat history">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full overflow-hidden">
                <img src="/nastar-mascot.png" alt="" className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="text-[#F5F5F5] text-sm font-medium">{agentMode ? agentMode.name : "Nastar Butler"}</span>
                <span className="text-green-400 text-[10px] ml-2">{agentMode ? "Working" : "Online"}</span>
              </div>
            </div>
          </div>
          <button onClick={startNewChat} className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition" title="New chat">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowHistory(false)}>
          <div className="w-72 h-full bg-[#111] border-r border-white/[0.06] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[#F5F5F5] text-sm font-semibold">History</span>
              <button onClick={startNewChat} className="text-[#F4C430] text-xs font-medium hover:underline">+ New Chat</button>
            </div>
            {chatSessions.length === 0 && (
              <p className="text-[#A1A1A1] text-xs p-4">No chat history yet</p>
            )}
            {chatSessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-2 px-4 py-3 cursor-pointer border-b border-white/[0.03] hover:bg-white/[0.04] transition ${s.id === currentSessionId ? "bg-[#F4C430]/10" : ""}`}
              >
                <button onClick={() => loadSession(s.id)} className="flex-1 text-left min-w-0">
                  <p className="text-[#E5E5E5] text-sm truncate">{s.title}</p>
                  <p className="text-[#666] text-[10px]">{new Date(s.date).toLocaleDateString()}</p>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 text-[#666] hover:text-red-400 transition p-1"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" />
        </div>
      )}
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
                className={`max-w-[90%] sm:max-w-[80%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed ${
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
                    {msg.services.map((svc, i) => {
                      const selToken = PAY_TOKENS.find(t => t.address.toLowerCase() === selectedPayToken.toLowerCase()) || PAY_TOKENS[0];
                      return (
                        <div key={i} className="p-3 rounded-xl bg-[#0A0A0A]/50 border border-[#F4C430]/20">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-[#F5F5F5] text-sm">{svc.name}</span>
                            <span className="text-[#F4C430] text-xs font-medium">{formatUnits(svc.pricePerCall, 18)} USD</span>
                          </div>
                          <p className="text-[#A1A1A1] text-xs mb-2 line-clamp-2">{svc.description}</p>
                          {/* Token selector */}
                          <div className="flex gap-1.5 mb-2">
                            {PAY_TOKENS.map((tk) => (
                              <button
                                key={tk.symbol}
                                onClick={() => setSelectedPayToken(tk.address)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition ${
                                  selectedPayToken.toLowerCase() === tk.address.toLowerCase()
                                    ? "bg-[#F4C430]/20 border-[#F4C430]/50 text-[#F4C430]"
                                    : "bg-white/[0.03] border-white/[0.08] text-[#A1A1A1] hover:border-white/[0.15]"
                                }`}
                              >
                                <img src={tk.logo} alt={tk.symbol} className="w-3.5 h-3.5" />
                                {tk.symbol}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => handleHire(svc, i)}
                            disabled={loading}
                            className="w-full py-1.5 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] disabled:opacity-50 transition"
                          >
                            Hire — {formatUnits(svc.pricePerCall, 18)} {selToken.symbol}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {msg.txHash && (
                  <a href={`https://celoscan.io/tx/${msg.txHash}`} target="_blank"
                    className="inline-block mt-2 text-xs text-[#F4C430] hover:underline">
                    View on CeloScan
                  </a>
                )}
                {msg.agentLink && (
                  <a href={`/chat?agent=${msg.agentLink.id}&name=${encodeURIComponent(msg.agentLink.name)}&mode=work`}
                    className="block mt-3 w-full py-2.5 rounded-xl bg-[#F4C430] text-[#0A0A0A] text-sm font-bold text-center hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition">
                    Chat with {msg.agentLink.name} to start your task
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
      <div className="border-t border-white/[0.06] bg-[#0A0A0A] px-2 sm:px-4 py-2 sm:py-3">
        <div className="max-w-2xl mx-auto flex gap-1.5 sm:gap-2">
          {nastarWallet && (
            <button
              onClick={() => setShowWalletPanel(true)}
              className="p-2.5 sm:px-3 sm:py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[#F4C430] hover:border-[#F4C430]/40 transition flex-shrink-0"
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
            placeholder="What do you need?"
            className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/40 focus:outline-none focus:border-[#F4C430]/40 transition text-sm"
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
            className={`hidden sm:block p-2.5 sm:p-3 rounded-xl border transition flex-shrink-0 ${isRecording ? "bg-red-500/20 border-red-500/40 text-red-400 animate-pulse" : "bg-white/[0.04] border-white/[0.08] text-[#A1A1A1] hover:text-[#F4C430] hover:border-[#F4C430]/30"}`}
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
          {/* QR / Camera scanner */}

          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] disabled:opacity-30 transition flex-shrink-0"
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
                      onClick={() => {
                        const bal = parseFloat(walletBalances[withdrawToken] || "0");
                        setWithdrawAmount(bal.toFixed(withdrawToken === "USDC" || withdrawToken === "USDT" ? 6 : 18).replace(/\.?0+$/, "") || "0");
                      }}
                      className="px-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#A1A1A1] text-xs hover:text-[#F4C430] transition"
                    >
                      MAX
                    </button>
                  </div>
                  <p className="text-[#A1A1A1]/30 text-[10px] mt-1">Available: {parseFloat(walletBalances[withdrawToken] || "0").toFixed(4)} {withdrawToken}</p>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-[#A1A1A1]/40 text-[10px]">Withdraw to your connected wallet</p>
                  <p className="text-[#F5F5F5] text-xs font-mono mt-0.5">{wallets[0]?.address ? `${wallets[0].address.slice(0, 8)}...${wallets[0].address.slice(-6)}` : "Not connected"}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!wallets[0]?.address || !withdrawAmount || withdrawing) return;
                    setWithdrawing(true);
                    try {
                      const decimals = withdrawToken === "USDC" || withdrawToken === "USDT" ? 6 : 18;
                      const raw = BigInt(Math.floor(parseFloat(withdrawAmount) * (10 ** decimals))).toString();
                      const API = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";
                      const r = await fetch(`${API}/v1/wallet/withdraw`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ownerAddress: wallets[0]?.address, to: wallets[0]?.address, token: withdrawToken, amount: raw }),
                      });
                      const d = await r.json();
                      if (d.success) {
                        setShowWalletPanel(false);
                        setWalletMode("idle");
                        addMsg({ role: "assistant", text: `Withdrawn ${d.amount} ${d.token} to ${d.to.slice(0, 6)}...${d.to.slice(-4)}.\nTX: ${d.txHash}` });
                        setWithdrawAmount("");
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
                  disabled={!wallets[0]?.address || !withdrawAmount || withdrawing}
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
