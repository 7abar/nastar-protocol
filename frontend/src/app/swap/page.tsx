"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { TOKEN_LIST, type TokenMeta } from "@/lib/contracts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

interface Quote {
  expectedAmountOut: string;
  exchangeRate: string;
  priceImpact: string;
}

interface SwapTx {
  step: number;
  type: string;
  description: string;
  to: string;
  data: string;
  value: string;
}

export default function SwapPage() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [tokenIn, setTokenIn] = useState<TokenMeta>(TOKEN_LIST[0]);   // USDm
  const [tokenOut, setTokenOut] = useState<TokenMeta>(TOKEN_LIST[1]); // EURm
  const [amountIn, setAmountIn] = useState("10");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [swapping, setSwapping] = useState(false);

  // ─── Quote ────────────────────────────────────────────────────────────────

  const fetchQuote = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) <= 0 || tokenIn.address === tokenOut.address) return;
    setQuoteLoading(true);
    setQuoteError("");
    try {
      const res = await fetch(
        `${API_URL}/v1/swap/quote?tokenIn=${tokenIn.address}&tokenOut=${tokenOut.address}&amountIn=${amountIn}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuote(data);
    } catch (err) {
      setQuoteError((err as Error).message);
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [tokenIn, tokenOut, amountIn]);

  useEffect(() => {
    const t = setTimeout(fetchQuote, 600);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  // ─── Swap ─────────────────────────────────────────────────────────────────

  async function executeSwap() {
    if (!authenticated || !quote) return;
    const wallet = wallets[0];
    if (!wallet) return;

    setSwapping(true);
    setStatus("Building swap...");
    setTxHash("");

    try {
      const address = wallet.address;
      const provider = await wallet.getEthereumProvider();

      // Build tx params from API
      const buildRes = await fetch(`${API_URL}/v1/swap/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn,
          recipient: address,
          owner: address,
          slippageTolerance: 0.5,
          deadlineMinutes: 10,
        }),
      });
      const buildData = await buildRes.json();
      if (!buildRes.ok) throw new Error(buildData.error);

      const txs: SwapTx[] = buildData.transactions;

      // Execute each step in order
      for (const tx of txs) {
        setStatus(`Step ${tx.step}/${buildData.totalSteps}: ${tx.description}`);
        const hash = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: address,
            to: tx.to,
            data: tx.data,
            value: tx.value === "0" ? "0x0" : `0x${parseInt(tx.value).toString(16)}`,
          }],
        });
        if (tx.type === "swap") setTxHash(hash as string);
        // Wait briefly between steps
        if (txs.indexOf(tx) < txs.length - 1) await new Promise(r => setTimeout(r, 2000));
      }

      setStatus("Swap complete!");
      fetchQuote();
    } catch (err) {
      setStatus("Error: " + (err as Error).message);
    } finally {
      setSwapping(false);
    }
  }

  // ─── Flip tokens ──────────────────────────────────────────────────────────
  function flip() {
    const tmp = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(tmp);
    setQuote(null);
  }

  const sameToken = tokenIn.address === tokenOut.address;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4C430]/10 text-[#F4C430] text-xs font-medium mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F4C430] animate-pulse" />
            Mento Protocol
          </div>
          <h1 className="text-2xl font-bold">Multi-Currency Swap</h1>
          <p className="text-[#A1A1A1] text-sm mt-1">Swap between Mento stablecoins on Celo. No slippage. Instant settlement.</p>
        </div>

        {/* Swap card */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-3">

          {/* Token In */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-[#A1A1A1]">You pay</span>
            </div>
            <div className="flex gap-3 items-center">
              <input
                type="number"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                className="flex-1 bg-transparent text-2xl font-bold text-white outline-none w-0"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
              <TokenSelect value={tokenIn} onChange={setTokenIn} exclude={tokenOut.address} />
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center">
            <button
              onClick={flip}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#F4C430]/20 border border-white/10 hover:border-[#F4C430]/30 flex items-center justify-center text-[#A1A1A1] hover:text-[#F4C430] transition text-lg"
            >
              ⇅
            </button>
          </div>

          {/* Token Out */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-[#A1A1A1]">You receive</span>
              {quoteLoading && <span className="text-xs text-[#A1A1A1] animate-pulse">Getting quote...</span>}
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex-1 text-2xl font-bold text-white">
                {quote ? (
                  <span className="text-green-400">{parseFloat(quote.expectedAmountOut).toFixed(4)}</span>
                ) : (
                  <span className="text-white/20">0.00</span>
                )}
              </div>
              <TokenSelect value={tokenOut} onChange={setTokenOut} exclude={tokenIn.address} />
            </div>
          </div>

          {/* Quote details */}
          {quote && !sameToken && (
            <div className="px-4 py-3 rounded-lg bg-white/5 text-xs space-y-1.5">
              <div className="flex justify-between text-[#A1A1A1]">
                <span>Rate</span>
                <span className="text-white font-mono">1 {tokenIn.symbol} = {parseFloat(quote.exchangeRate).toFixed(4)} {tokenOut.symbol}</span>
              </div>
              <div className="flex justify-between text-[#A1A1A1]">
                <span>Price impact</span>
                <span className="text-green-400">{quote.priceImpact}</span>
              </div>
              <div className="flex justify-between text-[#A1A1A1]">
                <span>Slippage tolerance</span>
                <span className="text-white">0.5%</span>
              </div>
              <div className="flex justify-between text-[#A1A1A1]">
                <span>Protocol</span>
                <span className="text-[#F4C430]">Mento v2</span>
              </div>
            </div>
          )}

          {quoteError && (
            <div className="px-4 py-3 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400">
              {quoteError}
            </div>
          )}

          {sameToken && (
            <div className="px-4 py-3 rounded-lg bg-yellow-400/10 border border-yellow-400/20 text-xs text-yellow-400">
              Select different tokens to swap
            </div>
          )}

          {/* Action button */}
          {!authenticated ? (
            <button
              onClick={login}
              className="w-full py-4 rounded-xl gradient-btn font-semibold text-base hover:shadow-[0_0_20px_#F4C430] transition"
            >
              Connect Wallet to Swap
            </button>
          ) : (
            <button
              onClick={executeSwap}
              disabled={!quote || swapping || sameToken || parseFloat(amountIn) <= 0}
              className="w-full py-4 rounded-xl gradient-btn font-semibold text-base hover:shadow-[0_0_20px_#F4C430] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {swapping ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  {status || "Swapping..."}
                </span>
              ) : (
                `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`
              )}
            </button>
          )}

          {/* Tx success */}
          {txHash && (
            <a
              href={`https://sepolia.celoscan.io/tx/${txHash}`}
              target="_blank" rel="noopener"
              className="block text-center text-xs text-[#F4C430] hover:underline"
            >
              View on Celoscan ↗
            </a>
          )}
        </div>

        {/* Supported tokens */}
        <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
          <p className="text-[#A1A1A1] text-xs mb-3 uppercase tracking-wider">Supported tokens</p>
          <div className="grid grid-cols-5 gap-2">
            {TOKEN_LIST.map((t) => (
              <div key={t.symbol} className="text-center">
                <div className="text-2xl mb-1">{t.flag}</div>
                <div className="text-[10px] font-bold text-white">{t.symbol}</div>
                <div className="text-[9px] text-[#A1A1A1] leading-tight">{t.name.replace("Mento ", "")}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Token Selector ───────────────────────────────────────────────────────────

function TokenSelect({ value, onChange, exclude }: {
  value: TokenMeta;
  onChange: (t: TokenMeta) => void;
  exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = TOKEN_LIST.filter(t => t.address !== exclude);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition"
      >
        <span className="text-lg">{value.flag}</span>
        <span className="font-bold text-white text-sm">{value.symbol}</span>
        <span className="text-[#A1A1A1] text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-[#111] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
          {filtered.map((t) => (
            <button
              key={t.symbol}
              onClick={() => { onChange(t); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition text-left ${t.address === value.address ? "bg-[#F4C430]/10" : ""}`}
            >
              <span className="text-xl">{t.flag}</span>
              <div>
                <div className="font-bold text-white text-sm">{t.symbol}</div>
                <div className="text-[#A1A1A1] text-xs">{t.name}</div>
              </div>
              {t.address === value.address && <span className="ml-auto text-[#F4C430] text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
