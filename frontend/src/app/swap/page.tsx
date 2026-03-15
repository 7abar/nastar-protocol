"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { TOKEN_LIST } from "@/lib/contracts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

// ─── Live rates from oracle ───────────────────────────────────────────────────
function useOracleRates() {
  const [rates, setRates] = useState<Record<string, { onchain: number | null; pyth: number | null; divergencePct: number | null }>>({});
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/v1/oracle/rates`);
        const data = await res.json();
        setRates(data.rates || {});
      } catch {}
    }
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  return rates;
}

export default function SwapPage() {
  const rates = useOracleRates();
  const [activeTab, setActiveTab] = useState<"flow" | "api" | "rates">("flow");
  const [quoteResult, setQuoteResult] = useState<string>("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [from, setFrom] = useState("USDm");
  const [to, setTo] = useState("EURm");
  const [amount, setAmount] = useState("100");

  async function runQuote() {
    setQuoteLoading(true);
    setQuoteResult("");
    try {
      const res = await fetch(`${API_URL}/v1/swap/quote?from=${from}&to=${to}&amountIn=${amount}`);
      const data = await res.json();
      setQuoteResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setQuoteResult("Error: " + (err as Error).message);
    }
    setQuoteLoading(false);
  }

  const usdPairs = Object.entries(rates).filter(([k]) => k.startsWith("USDm/"));

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-5xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4C430]/10 text-[#F4C430] text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F4C430] animate-pulse" />
            Agent-Native · Mento Protocol
          </div>
          <h1 className="text-3xl font-bold mb-2">Multi-Currency Swap</h1>
          <p className="text-[#A1A1A1] max-w-xl">
            Agents swap currencies programmatically — no human clicks required.
            A remittance agent receives USDm, auto-swaps to EURm, pays a European seller.
            All on-chain, all autonomous.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit mb-8">
          {[
            { id: "flow", label: "Agent Flow" },
            { id: "api", label: "API Reference" },
            { id: "rates", label: "Live FX Rates" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab.id ? "bg-[#F4C430] text-[#0A0A0A]" : "text-[#A1A1A1] hover:text-white"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Agent Flow tab ─────────────────────────────────────────────── */}
        {activeTab === "flow" && (
          <div className="space-y-6">

            {/* How agents use this */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  step: "1",
                  title: "Deal Completed",
                  desc: "Buyer pays 100 USDm into escrow. Deal delivered → Nastar releases 80 USDm to seller agent.",
                  color: "border-[#F4C430]/30 bg-[#F4C430]/5",
                  badge: "text-[#F4C430]",
                },
                {
                  step: "2",
                  title: "Auto-Swap Triggered",
                  desc: "Seller agent is configured to receive EURm. Runtime calls /v1/swap/build, executes approval + swap on-chain.",
                  color: "border-purple-400/30 bg-purple-400/5",
                  badge: "text-purple-400",
                },
                {
                  step: "3",
                  title: "Settled in Local Currency",
                  desc: "Seller receives ~73.6 EURm in their wallet. No human involvement. Mento AMM executes at live rate.",
                  color: "border-green-400/30 bg-green-400/5",
                  badge: "text-green-400",
                },
              ].map(s => (
                <div key={s.step} className={`rounded-xl border p-5 ${s.color}`}>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${s.badge}`}>Step {s.step}</div>
                  <h3 className="font-semibold text-white mb-2">{s.title}</h3>
                  <p className="text-[#A1A1A1] text-sm leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* Agent config snippet */}
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                <span className="text-sm font-medium">Agent auto-swap config</span>
                <span className="text-xs text-[#A1A1A1] font-mono">hosted-agent runtime</span>
              </div>
              <pre className="p-5 text-sm text-green-300 font-mono overflow-x-auto leading-relaxed">{`// When registering a hosted agent:
{
  "name": "Remittance Agent EU",
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini",
  "autoSwap": {
    "enabled": true,
    "targetToken": "EURm",           // Receive in Euros
    "targetAddress": "0x6B172e...",   // EURm on Celo Sepolia
    "slippageTolerance": 0.5,
    "triggerOnDealComplete": true     // Swap immediately after payout
  },
  "spendingLimits": {
    "maxPerCallUsd": 10,
    "dailyLimitUsd": 500
  }
}`}</pre>
            </div>

            {/* MCP tool example */}
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                <span className="text-sm font-medium">MCP tool call (agent-to-agent)</span>
                <span className="text-xs text-[#A1A1A1] font-mono">nastar_swap_quote</span>
              </div>
              <pre className="p-5 text-sm text-blue-300 font-mono overflow-x-auto leading-relaxed">{`// Claude / LLM agent calls:
const result = await tools.nastar_swap_quote({
  from: "USDm",
  to: "EURm",
  amount: "80"  // after Nastar 20% fee
});

// Returns:
{
  "tokenIn": { "symbol": "USDm", "flag": "🇺🇸" },
  "tokenOut": { "symbol": "EURm", "flag": "🇪🇺" },
  "amountIn": "80",
  "expectedAmountOut": "73.614",
  "exchangeRate": "0.920175",
  "priceImpact": "< 0.1%"
}`}</pre>
            </div>

            {/* Templates that use swap */}
            <div className="rounded-xl border border-white/10 p-5">
              <h3 className="font-semibold mb-4 text-[#A1A1A1] text-xs uppercase tracking-wider">Templates with auto-swap built-in</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { name: "Remittance", desc: "USD → local currency", icon: "💸", pair: "USDm → BRLm" },
                  { name: "FX Hedge", desc: "Multi-currency rebalance", icon: "📊", pair: "Dynamic" },
                  { name: "EU Payments", desc: "Pay European sellers", icon: "🇪🇺", pair: "USDm → EURm" },
                  { name: "Africa Agent", desc: "CFA franc settlements", icon: "🌍", pair: "USDm → XOFm" },
                ].map(t => (
                  <div key={t.name} className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="text-xl mb-1">{t.icon}</div>
                    <div className="font-semibold text-sm">{t.name}</div>
                    <div className="text-[#A1A1A1] text-xs mt-0.5">{t.desc}</div>
                    <div className="text-[#F4C430] text-[10px] font-mono mt-1.5">{t.pair}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── API Reference tab ──────────────────────────────────────────── */}
        {activeTab === "api" && (
          <div className="space-y-4">
            {[
              {
                method: "GET",
                path: "/v1/swap/quote",
                desc: "Get exchange rate and expected output amount",
                params: "?from=USDm&to=EURm&amountIn=100",
                color: "text-green-400 bg-green-400/10 border-green-400/20",
              },
              {
                method: "POST",
                path: "/v1/swap/build",
                desc: "Build approval + swap transaction calldata (no execution)",
                params: '{ "from": "USDm", "to": "EURm", "amountIn": "100", "recipient": "0x..." }',
                color: "text-blue-400 bg-blue-400/10 border-blue-400/20",
              },
              {
                method: "GET",
                path: "/v1/swap/pairs",
                desc: "List all tradable Mento token pairs",
                params: "",
                color: "text-green-400 bg-green-400/10 border-green-400/20",
              },
              {
                method: "GET",
                path: "/v1/oracle/rates",
                desc: "Full FX rate matrix — Mento on-chain + Pyth real-world",
                params: "",
                color: "text-green-400 bg-green-400/10 border-green-400/20",
              },
              {
                method: "GET",
                path: "/v1/oracle/rates/:from/:to",
                desc: "Specific pair with divergence alert",
                params: "/USDm/EURm",
                color: "text-green-400 bg-green-400/10 border-green-400/20",
              },
            ].map(ep => (
              <div key={ep.path} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="flex items-start gap-4 p-4">
                  <span className={`text-xs font-bold px-2 py-1 rounded border font-mono flex-shrink-0 ${ep.color}`}>{ep.method}</span>
                  <div className="flex-1 min-w-0">
                    <code className="text-white font-mono text-sm">{ep.path}</code>
                    <p className="text-[#A1A1A1] text-xs mt-1">{ep.desc}</p>
                    {ep.params && (
                      <code className="text-[#F4C430]/70 text-xs font-mono mt-1 block">{ep.params}</code>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Live query tester */}
            <div className="rounded-xl border border-[#F4C430]/20 bg-[#F4C430]/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-[#F4C430]/10">
                <span className="text-sm font-medium text-[#F4C430]">Try it — Live Quote</span>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[#A1A1A1] text-xs">From</span>
                    <select value={from} onChange={e => setFrom(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-white text-sm">
                      {TOKEN_LIST.map(t => <option key={t.symbol} value={t.symbol}>{t.flag} {t.symbol}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#A1A1A1] text-xs">To</span>
                    <select value={to} onChange={e => setTo(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-white text-sm">
                      {TOKEN_LIST.map(t => <option key={t.symbol} value={t.symbol}>{t.flag} {t.symbol}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#A1A1A1] text-xs">Amount</span>
                    <input value={amount} onChange={e => setAmount(e.target.value)}
                      className="w-24 px-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-white text-sm font-mono" />
                  </div>
                  <button onClick={runQuote} disabled={quoteLoading}
                    className="px-4 py-1.5 rounded-lg bg-[#F4C430] text-black text-sm font-semibold hover:bg-[#F4C430]/90 disabled:opacity-50 transition">
                    {quoteLoading ? "Loading..." : "Run →"}
                  </button>
                </div>
                {quoteResult && (
                  <pre className="text-xs font-mono text-green-300 bg-black/30 rounded-lg p-4 overflow-x-auto max-h-64">
                    {quoteResult}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Live FX Rates tab ──────────────────────────────────────────── */}
        {activeTab === "rates" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs text-[#A1A1A1]">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Mento on-chain (actual swap rate)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Pyth real-world (FX reference)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Divergence &gt; 1% = arbitrage signal</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {usdPairs.map(([key, r]) => {
                const sym = key.replace("USDm/", "");
                const token = TOKEN_LIST.find(t => t.symbol === sym);
                const divergent = (r.divergencePct ?? 0) > 1;
                return (
                  <div key={key} className={`rounded-xl border p-4 ${divergent ? "border-yellow-400/30 bg-yellow-400/5" : "border-white/10 bg-white/5"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{token?.flag}</span>
                        <span className="font-bold">{key}</span>
                      </div>
                      {divergent && (
                        <span className="text-yellow-400 text-xs px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20">
                          ⚠ {r.divergencePct?.toFixed(2)}% divergence
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[#A1A1A1] text-xs mb-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Mento on-chain
                        </div>
                        <div className="font-mono font-bold text-lg text-white">
                          {r.onchain ? r.onchain.toFixed(4) : <span className="text-white/20 text-sm">no pool</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#A1A1A1] text-xs mb-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Pyth real-world
                        </div>
                        <div className="font-mono font-bold text-lg text-white">
                          {r.pyth ? r.pyth.toFixed(4) : <span className="text-white/20 text-sm">no feed</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-[#A1A1A1]">
                      Source: {r.onchain && r.pyth ? "mento + pyth" : r.onchain ? "mento only" : r.pyth ? "pyth only" : "unavailable"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-[#A1A1A1]">
              <span className="text-white font-medium">Note on testnet:</span> Some Mento pools (BRLm, COPm) may not be deployed on Celo Sepolia testnet.
              On mainnet all pairs are active. Pyth feeds cover EUR, BRL, XOF. COP uses Mento on-chain only.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
