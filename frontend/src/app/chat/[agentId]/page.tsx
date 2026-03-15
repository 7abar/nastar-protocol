"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatUnits } from "viem";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

const MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google" },
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AgentChatPage() {
  const params = useParams();
  const agentId = params?.agentId as string;

  const [agent, setAgent] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load agent info
  useEffect(() => {
    async function loadAgent() {
      try {
        const res = await fetch(`${API_URL}/services`);
        if (res.ok) {
          const data = await res.json();
          const services = data.services || data || [];
          const match = services.find((s: any) => String(s.agentId) === String(agentId));
          if (match) setAgent(match);
        }
      } catch {}
    }
    if (agentId) loadAgent();
  }, [agentId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-8),
          agentId,
          model,
          agentContext: agent ? {
            name: agent.name,
            description: agent.description,
            systemPrompt: agent.systemPrompt || "",
          } : undefined,
        }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Try again." }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const selectedModel = MODELS.find((m) => m.id === model) || MODELS[0];
  const agentName = agent?.name || `Agent #${agentId}`;
  let price = "";
  try {
    if (agent?.pricePerCall) price = `${parseFloat(formatUnits(BigInt(agent.pricePerCall), 18)).toFixed(2)} USDC`;
  } catch {}

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/offerings" className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-[#A1A1A1] hover:text-white hover:bg-white/[0.08] transition shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold truncate">{agentName}</h1>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            </div>
            {price && <p className="text-[#A1A1A1]/40 text-[10px]">{price} per call</p>}
          </div>
        </div>

        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#A1A1A1] text-xs hover:text-white hover:border-white/[0.15] transition"
          >
            {selectedModel.label}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showModelPicker && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-[#1A1A1A] border border-white/[0.1] shadow-xl z-20 overflow-hidden">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id); setShowModelPicker(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs transition ${
                    model === m.id
                      ? "bg-[#E8500C]/10 text-[#E8500C]"
                      : "text-[#A1A1A1] hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="text-[#A1A1A1]/30 ml-2">{m.provider}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full overflow-hidden mb-4">
              <Image src="/nastar-mascot.png" alt="Nastar" width={80} height={80} className="w-full h-full object-cover" />
            </div>
            <p className="text-[#A1A1A1]/50 text-sm mb-1">Start a conversation with {agentName}</p>
            <p className="text-[#A1A1A1]/25 text-xs">Powered by {selectedModel.label}</p>
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#E8500C] text-[#0A0A0A] rounded-br-md"
                  : "bg-white/[0.06] text-[#F5F5F5] rounded-bl-md"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.06] px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1A1]/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1A1]/30 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A1A1A1]/30 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.06] shrink-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Type your message..."
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#E8500C]/30 text-sm transition disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="px-4 py-3 rounded-xl bg-[#E8500C] text-[#0A0A0A] font-medium text-sm hover:shadow-[0_0_15px_rgba(232,80,12,0.3)] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
