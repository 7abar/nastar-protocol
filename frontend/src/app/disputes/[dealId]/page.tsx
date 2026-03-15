"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, use } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { createPublicClient, http, formatUnits } from "viem";
import { celoSepoliaCustom, CONTRACTS, ESCROW_ABI } from "@/lib/contracts";

const client = createPublicClient({ chain: celoSepoliaCustom, transport: http() });
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

const STATUS_LABELS: Record<number, string> = {
  0: "Created", 1: "Accepted", 2: "Delivered", 3: "Completed",
  4: "Disputed", 5: "Refunded", 6: "Expired", 7: "Resolved",
};

interface Verdict {
  sellerBps: number;
  reasoning: string;
  summary: string;
  confidence: number;
  generatedAt: number;
  txHash?: string;
  executed: boolean;
}

interface JudgeCase {
  dealId: string;
  evidence: { role: string; text: string; submittedAt: number }[];
  verdict?: Verdict;
  status: string;
}

export default function DisputePage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = use(params);
  const { user } = usePrivy();
  const [deal, setDeal] = useState<any>(null);
  const [judgeCase, setJudgeCase] = useState<JudgeCase | null>(null);
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState<"buyer" | "seller" | "spectator">("spectator");

  useEffect(() => {
    loadDeal();
    loadJudgeCase();
    const interval = setInterval(loadJudgeCase, 5000);
    return () => clearInterval(interval);
  }, [dealId]);

  async function loadDeal() {
    try {
      const d = await client.readContract({
        address: CONTRACTS.NASTAR_ESCROW,
        abi: ESCROW_ABI,
        functionName: "getDeal",
        args: [BigInt(dealId)],
      });
      setDeal(d);
      const addr = user?.wallet?.address?.toLowerCase() || "";
      if ((d as any).buyer?.toLowerCase() === addr) setUserRole("buyer");
      else if ((d as any).seller?.toLowerCase() === addr) setUserRole("seller");
    } catch { /* */ }
    setLoading(false);
  }

  async function loadJudgeCase() {
    try {
      const res = await fetch(`${API_URL}/v1/judge/${dealId}`);
      if (res.ok) setJudgeCase(await res.json());
    } catch { /* */ }
  }

  async function submitEvidence() {
    if (!evidence.trim() || userRole === "spectator") return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/v1/judge/${dealId}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: userRole, evidence: evidence.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadJudgeCase();
      setEvidence("");
    } catch (err: any) {
      setError(err.message || "Failed to submit");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#E8500C] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-center">
        <div>
          <div className="text-4xl mb-4">&#9878;</div>
          <h1 className="text-xl font-bold text-white mb-2">Deal Not Found</h1>
          <Link href="/deals" className="text-[#E8500C] text-sm hover:underline">Back to Deals</Link>
        </div>
      </div>
    );
  }

  const amount = formatUnits(deal.amount, 6);
  const statusNum = Number(deal.status);
  const isDisputed = statusNum === 4;
  const isResolved = statusNum === 7;

  const hasVerdict = judgeCase?.verdict != null;
  const verdictBps = judgeCase?.verdict?.sellerBps || 0;
  const buyerPct = ((10000 - verdictBps) / 100).toFixed(0);
  const sellerPct = (verdictBps / 100).toFixed(0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/deals" className="text-[#A1A1A1] text-sm hover:text-white transition mb-2 inline-block">
              &#8592; Back to Deals
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">&#9878;</span>
              AI Dispute Judge
            </h1>
            <p className="text-[#A1A1A1] text-sm mt-1">Deal #{dealId} &middot; {amount} USDC</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            isResolved ? "bg-green-500/20 text-green-400" :
            isDisputed ? "bg-red-500/20 text-red-400" :
            "bg-white/10 text-white/60"
          }`}>
            {STATUS_LABELS[statusNum] || "Unknown"}
          </span>
        </div>

        {/* Deal info */}
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 mb-6">
          <h3 className="text-sm font-medium text-[#A1A1A1] uppercase tracking-wider mb-3">Task Details</h3>
          <p className="text-white text-sm leading-relaxed mb-4">{deal.taskDescription}</p>
          {deal.deliveryProof && (
            <div>
              <h4 className="text-xs text-[#A1A1A1] uppercase tracking-wider mb-1">Delivery Proof</h4>
              <p className="text-[#E8500C] text-sm font-mono break-all">{deal.deliveryProof}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 mt-4 text-xs">
            <div>
              <span className="text-[#A1A1A1]">Buyer</span>
              <p className="text-white font-mono mt-0.5">{deal.buyer.slice(0, 10)}...{deal.buyer.slice(-8)}</p>
            </div>
            <div>
              <span className="text-[#A1A1A1]">Seller</span>
              <p className="text-white font-mono mt-0.5">{deal.seller.slice(0, 10)}...{deal.seller.slice(-8)}</p>
            </div>
          </div>
        </div>

        {/* Verdict */}
        {hasVerdict && (
          <div className={`p-6 rounded-xl border mb-6 ${
            judgeCase!.verdict!.executed
              ? "bg-green-500/5 border-green-500/30"
              : "bg-[#E8500C]/5 border-[#E8500C]/30"
          }`}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">&#9878;</span>
              <h3 className="font-bold text-lg">
                {judgeCase!.verdict!.executed ? "Verdict Executed" : "Verdict Issued"}
              </h3>
              <span className="ml-auto text-xs px-2 py-0.5 rounded bg-white/10 text-[#A1A1A1]">
                {judgeCase!.verdict!.confidence}% confidence
              </span>
            </div>

            <p className="text-white text-sm mb-4">{judgeCase!.verdict!.summary}</p>

            {/* Split visualization */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-[#A1A1A1] mb-1">
                <span>Buyer gets {buyerPct}%</span>
                <span>Seller gets {sellerPct}%</span>
              </div>
              <div className="w-full h-4 rounded-full bg-white/10 overflow-hidden flex">
                <div
                  className="h-full bg-blue-400 transition-all"
                  style={{ width: `${buyerPct}%` }}
                />
                <div
                  className="h-full bg-green-400 transition-all"
                  style={{ width: `${sellerPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-blue-400">{(parseFloat(amount) * parseInt(buyerPct) / 100).toFixed(2)} USDC</span>
                <span className="text-green-400">{(parseFloat(amount) * parseInt(sellerPct) / 100).toFixed(2)} USDC</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/5 text-sm">
              <h4 className="text-[#A1A1A1] text-xs uppercase tracking-wider mb-1">Reasoning (stored on-chain)</h4>
              <p className="text-white/80 italic">&ldquo;{judgeCase!.verdict!.reasoning}&rdquo;</p>
            </div>

            {judgeCase!.verdict!.txHash && (
              <a
                href={`https://sepolia.celoscan.io/tx/${judgeCase!.verdict!.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-3 text-xs text-[#E8500C] hover:underline font-mono"
              >
                TX: {judgeCase!.verdict!.txHash.slice(0, 20)}...
              </a>
            )}
          </div>
        )}

        {/* Judge status */}
        {judgeCase && !hasVerdict && (
          <div className="p-5 rounded-xl bg-[#E8500C]/5 border border-[#E8500C]/20 mb-6">
            <div className="flex items-center gap-3">
              {judgeCase.status === "deliberating" ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-[#E8500C] border-t-transparent rounded-full" />
                  <div>
                    <h3 className="font-semibold text-[#E8500C]">AI Judge is deliberating...</h3>
                    <p className="text-[#A1A1A1] text-xs mt-0.5">Analyzing evidence. Verdict incoming.</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xl">&#128203;</span>
                  <div>
                    <h3 className="font-semibold text-white">Evidence received</h3>
                    <p className="text-[#A1A1A1] text-xs mt-0.5">
                      From: {judgeCase.evidence.map(e => e.role).join(", ")}.
                      {judgeCase.evidence.length < 2 && " Waiting for other party or 1-hour timeout."}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Submitted evidence */}
        {judgeCase?.evidence && judgeCase.evidence.length > 0 && (
          <div className="space-y-3 mb-6">
            {judgeCase.evidence.map((e, i) => (
              <div key={i} className={`p-4 rounded-xl border ${
                e.role === "buyer" ? "bg-blue-500/5 border-blue-500/20" : "bg-green-500/5 border-green-500/20"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    e.role === "buyer" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"
                  }`}>
                    {e.role === "buyer" ? "Buyer" : "Seller"}
                  </span>
                  <span className="text-xs text-[#A1A1A1]">
                    {new Date(e.submittedAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-white/80 text-sm">{e.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Submit evidence */}
        {isDisputed && userRole !== "spectator" && !hasVerdict && (
          <div className="p-5 rounded-xl bg-white/5 border border-white/10">
            <h3 className="font-semibold mb-3">
              Submit Your Evidence
              <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                userRole === "buyer" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"
              }`}>
                as {userRole}
              </span>
            </h3>

            {error && (
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-3">
                {error}
              </div>
            )}

            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder={userRole === "buyer"
                ? "Explain why the delivery does not meet the task requirements..."
                : "Explain why your delivery fulfills the task requirements..."}
              rows={5}
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-[#E8500C]/30 text-white placeholder-white/20 focus:outline-none focus:border-[#E8500C]/70 resize-none text-sm mb-3"
            />

            <button
              onClick={submitEvidence}
              disabled={!evidence.trim() || submitting}
              className="w-full py-3 rounded-xl gradient-btn font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_15px_#E8500C] transition"
            >
              {submitting ? "Submitting..." : "Submit Evidence to AI Judge"}
            </button>

            <p className="text-[#A1A1A1]/40 text-xs mt-2 text-center">
              The AI judge will analyze both sides and issue a binding verdict with a custom payment split.
            </p>
          </div>
        )}

        {/* Spectator message */}
        {userRole === "spectator" && !hasVerdict && isDisputed && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <p className="text-[#A1A1A1] text-sm">
              Connect your wallet as buyer or seller to submit evidence.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
