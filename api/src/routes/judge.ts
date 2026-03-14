/**
 * /v1/judge — AI Dispute Judge
 *
 * POST /v1/judge/:dealId/request   — buyer or seller submits evidence + requests AI verdict
 * GET  /v1/judge/:dealId           — get current verdict status
 * POST /v1/judge/:dealId/execute   — execute verdict on-chain (called automatically after verdict)
 */

import { Router, Request, Response } from "express";
import { createWalletClient, createPublicClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const router = Router();

// ─── Celo Sepolia ─────────────────────────────────────────────────────────────

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  network: "celo-sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
});

const ESCROW_ADDRESS = (process.env.NASTAR_ESCROW || "0xAE17AaccD135BD434E13990Dd2fAAA743f32b1e1") as `0x${string}`;

const RESOLVE_ABI = [{
  type: "function",
  name: "resolveDisputeWithJudge",
  inputs: [
    { name: "dealId", type: "uint256" },
    { name: "sellerBps", type: "uint256" },
    { name: "reasoning", type: "string" },
  ],
  outputs: [],
  stateMutability: "nonpayable",
}] as const;

const GET_DEAL_ABI = [{
  type: "function",
  name: "getDeal",
  inputs: [{ name: "dealId", type: "uint256" }],
  outputs: [{
    type: "tuple",
    components: [
      { name: "dealId", type: "uint256" }, { name: "serviceId", type: "uint256" },
      { name: "buyerAgentId", type: "uint256" }, { name: "sellerAgentId", type: "uint256" },
      { name: "buyer", type: "address" }, { name: "seller", type: "address" },
      { name: "paymentToken", type: "address" }, { name: "amount", type: "uint256" },
      { name: "taskDescription", type: "string" }, { name: "deliveryProof", type: "string" },
      { name: "status", type: "uint8" }, { name: "createdAt", type: "uint256" },
      { name: "deadline", type: "uint256" }, { name: "completedAt", type: "uint256" },
      { name: "disputedAt", type: "uint256" },
    ],
  }],
  stateMutability: "view",
}] as const;

// ─── In-memory verdict store ───────────────────────────────────────────────────

interface Evidence {
  role: "buyer" | "seller";
  text: string;
  submittedAt: number;
}

interface JudgeCase {
  dealId: string;
  evidence: Evidence[];
  verdict?: {
    sellerBps: number;
    reasoning: string;
    summary: string;
    confidence: number;
    generatedAt: number;
    txHash?: string;
    executed: boolean;
  };
  status: "open" | "deliberating" | "decided" | "executed";
  requestedAt: number;
}

const cases = new Map<string, JudgeCase>();

// ─── GET /v1/judge/:dealId ─────────────────────────────────────────────────────

router.get("/:dealId", (req: Request, res: Response) => {
  const c = cases.get(req.params.dealId);
  if (!c) return res.status(404).json({ error: "No judge case found for this deal" });
  return res.json(c);
});

// ─── POST /v1/judge/:dealId/request ───────────────────────────────────────────

router.post("/:dealId/request", async (req: Request, res: Response) => {
  const { dealId } = req.params;
  const { role, evidence: evidenceText } = req.body;

  if (!role || !evidenceText) {
    return res.status(400).json({ error: "Missing role (buyer|seller) or evidence text" });
  }

  // Init case if not exists
  if (!cases.has(dealId)) {
    cases.set(dealId, {
      dealId,
      evidence: [],
      status: "open",
      requestedAt: Date.now(),
    });
  }

  const c = cases.get(dealId)!;
  if (c.status === "decided" || c.status === "executed") {
    return res.status(409).json({ error: "Verdict already issued", verdict: c.verdict });
  }

  // Add evidence
  c.evidence = c.evidence.filter((e) => e.role !== role); // replace if re-submitted
  c.evidence.push({ role: role as "buyer" | "seller", text: evidenceText, submittedAt: Date.now() });

  // Fetch deal from chain
  let deal: any;
  try {
    const publicClient = createPublicClient({ chain: celoSepolia, transport: http() });
    deal = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: GET_DEAL_ABI,
      functionName: "getDeal",
      args: [BigInt(dealId)],
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch deal from chain" });
  }

  // STATUS 4 = Disputed
  if (Number(deal.status) !== 4) {
    return res.status(400).json({ error: "Deal is not in Disputed status", status: deal.status });
  }

  // If both parties submitted evidence, trigger AI verdict
  const hasBoth = c.evidence.some((e) => e.role === "buyer") && c.evidence.some((e) => e.role === "seller");

  // Also allow single-party verdict after 1 hour (no response = weaker case)
  const elapsed = Date.now() - c.requestedAt;
  const singlePartyOk = elapsed > 60 * 60 * 1000; // 1 hour

  if (hasBoth || singlePartyOk) {
    c.status = "deliberating";
    // Run async — don't block response
    runJudge(c, deal).catch(console.error);
  }

  return res.json({
    status: c.status,
    evidenceReceived: c.evidence.map((e) => e.role),
    message: hasBoth
      ? "Both parties submitted. AI judge is deliberating..."
      : "Evidence received. Waiting for other party (or 1-hour timeout).",
  });
});

// ─── AI Judge Logic ───────────────────────────────────────────────────────────

async function runJudge(c: JudgeCase, deal: any): Promise<void> {
  try {
    const buyerEvidence = c.evidence.find((e) => e.role === "buyer")?.text || "(no evidence submitted)";
    const sellerEvidence = c.evidence.find((e) => e.role === "seller")?.text || "(no evidence submitted)";

    const amountUsdc = (Number(deal.amount) / 1e6).toFixed(2);

    const systemPrompt = `You are an impartial AI arbitrator for Nastar, a trustless AI agent marketplace on Celo.
Your job is to resolve payment disputes between buyers and sellers of AI agent services.
You must be fair, consistent, and base decisions solely on the evidence provided.
Output ONLY valid JSON. No markdown, no explanation outside the JSON.`;

    const userPrompt = `DISPUTE CASE #${c.dealId}

DEAL AMOUNT: $${amountUsdc} USDC
TASK DESCRIPTION: ${deal.taskDescription}
DELIVERY PROOF: ${deal.deliveryProof || "(none provided)"}

BUYER'S EVIDENCE (claims delivery was unsatisfactory):
${buyerEvidence}

SELLER'S EVIDENCE (claims delivery was completed):
${sellerEvidence}

Analyze this dispute and return a JSON verdict:
{
  "sellerBps": <integer 0-10000, basis points awarded to seller>,
  "reasoning": "<detailed reasoning, max 200 chars, stored on-chain>",
  "summary": "<1-2 sentence human-readable verdict>",
  "confidence": <integer 0-100, your confidence in this verdict>
}

Guidelines:
- sellerBps 10000 = seller wins fully (delivery meets requirements)
- sellerBps 0 = buyer wins fully (delivery completely missing or fraudulent)
- sellerBps 5000-8000 = partial delivery (good faith effort but incomplete)
- If seller provided no delivery proof, lean toward buyer
- If buyer provided no specific complaints, lean toward seller
- Consider the task complexity vs delivery proof quality`;

    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    const useAnthropic = !process.env.OPENAI_API_KEY && !!process.env.ANTHROPIC_API_KEY;

    let raw: string;

    if (useAnthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-3-5",
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const data = await res.json() as any;
      raw = data.content[0]?.text || "{}";
    } else {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 512,
          response_format: { type: "json_object" },
        }),
      });
      const data = await res.json() as any;
      raw = data.choices[0]?.message?.content || "{}";
    }

    const verdict = JSON.parse(raw);
    const sellerBps = Math.max(0, Math.min(10000, parseInt(verdict.sellerBps)));

    c.verdict = {
      sellerBps,
      reasoning: (verdict.reasoning || "AI judge verdict").slice(0, 200),
      summary: verdict.summary || "Verdict issued.",
      confidence: verdict.confidence || 80,
      generatedAt: Date.now(),
      executed: false,
    };
    c.status = "decided";

    // Auto-execute on-chain
    await executeVerdict(c);
  } catch (err) {
    console.error("Judge error:", err);
    // Fallback: 50/50
    c.verdict = {
      sellerBps: 5000,
      reasoning: "AI unavailable. Defaulting to 50/50 split.",
      summary: "AI judge unavailable. Funds split equally.",
      confidence: 0,
      generatedAt: Date.now(),
      executed: false,
    };
    c.status = "decided";
    await executeVerdict(c);
  }
}

async function executeVerdict(c: JudgeCase): Promise<void> {
  if (!c.verdict || c.verdict.executed) return;

  const judgeKey = process.env.JUDGE_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!judgeKey) {
    console.error("No JUDGE_PRIVATE_KEY set — verdict decided but not executed on-chain");
    return;
  }

  try {
    const account = privateKeyToAccount(judgeKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: celoSepolia, transport: http() });

    const hash = await walletClient.writeContract({
      address: ESCROW_ADDRESS,
      abi: RESOLVE_ABI,
      functionName: "resolveDisputeWithJudge",
      args: [BigInt(c.dealId), BigInt(c.verdict.sellerBps), c.verdict.reasoning],
    });

    c.verdict.txHash = hash;
    c.verdict.executed = true;
    c.status = "executed";
    console.log(`[Judge] Deal #${c.dealId} resolved. TX: ${hash}. sellerBps: ${c.verdict.sellerBps}`);
  } catch (err) {
    console.error("On-chain execution failed:", err);
  }
}

export default router;
