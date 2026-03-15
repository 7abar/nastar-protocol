/**
 * /v1/judge — AI Dispute Judge
 * Persisted in Supabase (judge_cases + judge_evidence tables).
 */

import { Router, Request, Response } from "express";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celoAlfajores as celoSepolia, CONTRACTS } from "../config.js";
import { db, dbGet, dbUpsert, dbUpdate } from "../lib/supabase.js";

const router = Router();

const ESCROW_ADDRESS = CONTRACTS.NASTAR_ESCROW;

const RESOLVE_ABI = [{
  type: "function", name: "resolveDisputeWithJudge",
  inputs: [{ name: "dealId", type: "uint256" }, { name: "sellerBps", type: "uint256" }, { name: "reasoning", type: "string" }],
  outputs: [], stateMutability: "nonpayable",
}] as const;

const GET_DEAL_ABI = [{
  type: "function", name: "getDeal",
  inputs: [{ name: "dealId", type: "uint256" }],
  outputs: [{ type: "tuple", components: [
    { name: "dealId", type: "uint256" }, { name: "serviceId", type: "uint256" },
    { name: "buyerAgentId", type: "uint256" }, { name: "sellerAgentId", type: "uint256" },
    { name: "buyer", type: "address" }, { name: "seller", type: "address" },
    { name: "paymentToken", type: "address" }, { name: "amount", type: "uint256" },
    { name: "taskDescription", type: "string" }, { name: "deliveryProof", type: "string" },
    { name: "status", type: "uint8" }, { name: "createdAt", type: "uint256" },
    { name: "deadline", type: "uint256" }, { name: "completedAt", type: "uint256" },
    { name: "disputedAt", type: "uint256" },
  ]}],
  stateMutability: "view",
}] as const;

// ─── GET /v1/judge/:dealId ─────────────────────────────────────────────────────

router.get("/:dealId", async (req: Request, res: Response) => {
  const c = await dbGet<any>("judge_cases", { deal_id: req.params.dealId });
  if (!c) return res.status(404).json({ error: "No judge case found for this deal" });

  const { data: evidence } = await db.from("judge_evidence").select("*").eq("deal_id", req.params.dealId);

  return res.json({
    dealId: c.deal_id,
    status: c.status,
    verdict: c.verdict,
    evidence: (evidence || []).map((e: any) => ({ role: e.role, text: e.evidence_text, submittedAt: new Date(e.submitted_at).getTime() })),
    requestedAt: new Date(c.requested_at).getTime(),
  });
});

// ─── POST /v1/judge/:dealId/request ───────────────────────────────────────────

router.post("/:dealId/request", async (req: Request, res: Response) => {
  const { dealId } = req.params;
  const { role, evidence: evidenceText } = req.body;

  if (!role || !evidenceText) return res.status(400).json({ error: "Missing role or evidence" });

  // Init case if not exists
  const existing = await dbGet<any>("judge_cases", { deal_id: dealId });
  if (!existing) {
    await dbUpsert("judge_cases", { deal_id: dealId, status: "open" }, "deal_id");
  } else if (existing.status === "decided" || existing.status === "executed") {
    return res.status(409).json({ error: "Verdict already issued", verdict: existing.verdict });
  }

  // Upsert evidence
  const { error: evErr } = await db.from("judge_evidence")
    .upsert({ deal_id: dealId, role, evidence_text: evidenceText }, { onConflict: "deal_id,role" });
  if (evErr) return res.status(500).json({ error: evErr.message });

  // Fetch deal from chain
  let deal: any;
  try {
    const publicClient = createPublicClient({ chain: celoSepolia, transport: http() });
    deal = await publicClient.readContract({ address: ESCROW_ADDRESS, abi: GET_DEAL_ABI, functionName: "getDeal", args: [BigInt(dealId)] });
  } catch { return res.status(500).json({ error: "Failed to fetch deal from chain" }); }

  if (Number(deal.status) !== 4) return res.status(400).json({ error: "Deal is not Disputed", status: deal.status });

  // Check if both sides submitted
  const { data: allEvidence } = await db.from("judge_evidence").select("role").eq("deal_id", dealId);
  const roles = (allEvidence || []).map((e: any) => e.role);
  const hasBoth = roles.includes("buyer") && roles.includes("seller");
  const caseRow = await dbGet<any>("judge_cases", { deal_id: dealId });
  const elapsed = Date.now() - new Date(caseRow?.requested_at || Date.now()).getTime();
  const singlePartyOk = elapsed > 60 * 60 * 1000;

  if (hasBoth || singlePartyOk) {
    // Re-fetch status to prevent race condition — only one request should trigger judge
    const freshCase = await dbGet<any>("judge_cases", { deal_id: dealId });
    if (freshCase?.status === "open") {
      await dbUpdate("judge_cases", { deal_id: dealId }, { status: "deliberating" });
      runJudge(dealId, deal).catch(console.error);
    }
  }

  return res.json({
    status: hasBoth || singlePartyOk ? "deliberating" : "open",
    evidenceReceived: roles,
    message: hasBoth ? "Both parties submitted. AI judge deliberating..." : "Evidence received. Waiting for other party.",
  });
});

// ─── AI Judge Logic ───────────────────────────────────────────────────────────

async function runJudge(dealId: string, deal: any): Promise<void> {
  const { data: evidence } = await db.from("judge_evidence").select("*").eq("deal_id", dealId);
  const buyerEv = evidence?.find((e: any) => e.role === "buyer")?.evidence_text || "(no evidence submitted)";
  const sellerEv = evidence?.find((e: any) => e.role === "seller")?.evidence_text || "(no evidence submitted)";
  const amountUsdc = (Number(deal.amount) / 1e6).toFixed(2);

  const systemPrompt = `You are an impartial AI arbitrator for Nastar, a trustless agent marketplace on Celo. Output ONLY valid JSON.`;
  const userPrompt = `DISPUTE #${dealId}
AMOUNT: $${amountUsdc} USDC
TASK: ${deal.taskDescription}
DELIVERY PROOF: ${deal.deliveryProof || "(none)"}

BUYER: ${buyerEv}
SELLER: ${sellerEv}

Return JSON:
{
  "sellerBps": <0-10000>,
  "reasoning": "<max 200 chars, stored on-chain>",
  "summary": "<1-2 sentence verdict>",
  "confidence": <0-100>
}

10000 = seller wins fully. 0 = buyer wins. 5000 = 50/50.`;

  try {
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    const useAnthropic = !process.env.OPENAI_API_KEY && !!process.env.ANTHROPIC_API_KEY;
    let raw: string;

    if (useAnthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-3-5", max_tokens: 512, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
      });
      const data = await res.json() as any;
      raw = data.content[0]?.text || "{}";
    } else {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: 512, response_format: { type: "json_object" } }),
      });
      const data = await res.json() as any;
      raw = data.choices[0]?.message?.content || "{}";
    }

    const v = JSON.parse(raw);
    const sellerBps = Math.max(0, Math.min(10000, parseInt(v.sellerBps)));
    const verdict = {
      sellerBps, reasoning: (v.reasoning || "AI verdict").slice(0, 200),
      summary: v.summary || "Verdict issued.", confidence: v.confidence || 80,
      generatedAt: Date.now(), executed: false,
    };

    await dbUpdate("judge_cases", { deal_id: dealId }, { status: "decided", verdict });
    await executeVerdict(dealId, verdict);
  } catch (err) {
    const fallback = { sellerBps: 5000, reasoning: "AI unavailable. Default 50/50.", summary: "Funds split equally.", confidence: 0, generatedAt: Date.now(), executed: false };
    await dbUpdate("judge_cases", { deal_id: dealId }, { status: "decided", verdict: fallback });
    await executeVerdict(dealId, fallback);
  }
}

async function executeVerdict(dealId: string, verdict: any): Promise<void> {
  const judgeKey = process.env.JUDGE_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!judgeKey) return;
  try {
    const account = privateKeyToAccount(judgeKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: celoSepolia, transport: http() });
    const hash = await walletClient.writeContract({
      address: ESCROW_ADDRESS, abi: RESOLVE_ABI, functionName: "resolveDisputeWithJudge",
      args: [BigInt(dealId), BigInt(verdict.sellerBps), verdict.reasoning],
    });
    await dbUpdate("judge_cases", { deal_id: dealId }, {
      status: "executed",
      verdict: { ...verdict, txHash: hash, executed: true },
    });
    console.log(`[Judge] Deal #${dealId} resolved. TX: ${hash}`);
  } catch (err) { console.error("On-chain execution failed:", err); }
}

export default router;
