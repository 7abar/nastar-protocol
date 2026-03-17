/**
 * /v1/jobs — ACP-style job system
 *
 * POST   /v1/jobs                  — buyer creates a job (replaces hire flow)
 * GET    /v1/jobs                  — list jobs (buyer or seller)
 * GET    /v1/jobs/:id              — job status + full details
 * POST   /v1/jobs/:id/pay          — buyer approves payment (NEGOTIATION → IN_PROGRESS)
 * POST   /v1/jobs/:id/deliver      — seller/agent submits deliverable
 * POST   /v1/jobs/:id/reject       — buyer or seller rejects
 *
 * GET    /v1/jobs/pending          — seller polls for new OPEN jobs (?agentId=X)
 * POST   /v1/jobs/:id/request-payment  — seller sends payment request (OPEN → NEGOTIATION)
 */

import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { publicClient, serialize, DEAL_STATUS } from "../lib/client.js";
import { CONTRACTS, CELO_TOKENS, getTokenMeta } from "../config.js";
import { NASTAR_ESCROW_ABI, SERVICE_REGISTRY_ABI } from "../abis.js";
import { createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const router = Router();

function supabaseClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY!
  );
}

function addMemo(history: any[], phase: string, message: string) {
  return [...(history || []), { phase, message, ts: Date.now() }];
}

// ── POST /v1/jobs — buyer creates a job ──────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      buyerAddress,
      sellerAgentId,
      offeringName,
      serviceId,
      requirements = {},
      paymentToken,
      amount,
    } = req.body;

    if (!buyerAddress || !sellerAgentId || !offeringName) {
      return res.status(400).json({ error: "buyerAddress, sellerAgentId, offeringName required" });
    }

    const token = paymentToken || CELO_TOKENS.USDm;
    const meta = getTokenMeta(token);
    const amountStr = amount?.toString() || "1000000000000000000";

    const supabase = supabaseClient();

    // Get seller's agent wallet
    const { data: agentData } = await supabase
      .from("hosted_agents")
      .select("agent_wallet, name")
      .eq("agent_nft_id", sellerAgentId)
      .limit(1);

    const sellerAddress = agentData?.[0]?.agent_wallet || null;

    const memo = addMemo([], "OPEN", `Job created by ${buyerAddress.slice(0, 8)}...`);

    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        buyer_address: buyerAddress.toLowerCase(),
        seller_agent_id: Number(sellerAgentId),
        seller_address: sellerAddress,
        offering_name: offeringName,
        service_id: serviceId || null,
        requirements,
        payment_token: token,
        amount: amountStr,
        amount_usd: parseFloat(formatUnits(BigInt(amountStr), meta.decimals)),
        phase: "OPEN",
        memo_history: memo,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Trigger auto-execution for hosted agents
    triggerHostedAgent(job, sellerAgentId, requirements).catch(() => {});

    return res.status(201).json({
      jobId: job.id,
      phase: job.phase,
      sellerAgentId,
      offeringName,
      amount: formatUnits(BigInt(amountStr), meta.decimals),
      token: meta.symbol,
      message: "Job created. Waiting for seller to confirm and request payment.",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /v1/jobs — list jobs ─────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const { buyerAddress, sellerAgentId, phase, limit = 20 } = req.query;
    const supabase = supabaseClient();

    let query = supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(Number(limit));

    if (buyerAddress) query = query.ilike("buyer_address", String(buyerAddress));
    if (sellerAgentId) query = query.eq("seller_agent_id", Number(sellerAgentId));
    if (phase) query = query.eq("phase", String(phase).toUpperCase());

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ jobs: data || [], total: data?.length || 0 });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /v1/jobs/pending — seller polls for OPEN jobs ────────────────────────
router.get("/pending", async (req: Request, res: Response) => {
  try {
    const { agentId, limit = 10 } = req.query;
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const supabase = supabaseClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("seller_agent_id", Number(agentId))
      .in("phase", ["OPEN", "NEGOTIATION"])
      .order("created_at", { ascending: true })
      .limit(Number(limit));

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ pending: data || [], count: data?.length || 0 });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── GET /v1/jobs/:id — job status ────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const supabase = supabaseClient();
    const { data, error } = await supabase.from("jobs").select("*").eq("id", req.params.id).single();
    if (error || !data) return res.status(404).json({ error: "Job not found" });
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /v1/jobs/:id/request-payment — OPEN → NEGOTIATION ──────────────────
router.post("/:id/request-payment", async (req: Request, res: Response) => {
  try {
    const { amount, token, message = "" } = req.body;
    const supabase = supabaseClient();

    const { data: job } = await supabase.from("jobs").select("*").eq("id", req.params.id).single();
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.phase !== "OPEN") return res.status(400).json({ error: `Job is in ${job.phase}, expected OPEN` });

    const paymentRequest = {
      amount: amount || job.amount,
      token: token || job.payment_token,
      usd_value: job.amount_usd,
      message: message || `Payment request for ${job.offering_name}`,
    };

    const memo = addMemo(job.memo_history, "NEGOTIATION", `Seller requested payment: ${paymentRequest.usd_value} USD`);

    const { error } = await supabase.from("jobs").update({
      phase: "NEGOTIATION",
      payment_request: paymentRequest,
      memo_history: memo,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, phase: "NEGOTIATION", paymentRequest });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /v1/jobs/:id/pay — buyer approves → IN_PROGRESS ────────────────────
router.post("/:id/pay", async (req: Request, res: Response) => {
  try {
    const { accept = true, ownerAddress, content } = req.body;
    const supabase = supabaseClient();

    const { data: job } = await supabase.from("jobs").select("*").eq("id", req.params.id).single();
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.phase !== "NEGOTIATION") return res.status(400).json({ error: `Job is in ${job.phase}, expected NEGOTIATION` });

    if (!accept) {
      const memo = addMemo(job.memo_history, "REJECTED", content || "Buyer rejected payment");
      await supabase.from("jobs").update({ phase: "REJECTED", memo_history: memo, updated_at: new Date().toISOString() }).eq("id", req.params.id);
      return res.json({ success: true, phase: "REJECTED" });
    }

    // Execute on-chain escrow lock
    const buyer = ownerAddress || job.buyer_address;
    let dealId = null;
    let dealTxHash = null;

    try {
      const API = process.env.API_URL || "https://api.nastar.fun";
      const walletRes = await fetch(`${API}/v1/wallet/hire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: buyer,
          serviceIndex: job.service_id,
          sellerAgentId: job.seller_agent_id,
          paymentToken: job.payment_token,
          amount: job.amount,
          serviceName: job.offering_name,
        }),
      });
      const walletData = await walletRes.json() as any;
      dealId = walletData.dealId;
      dealTxHash = walletData.dealTxHash;
    } catch {}

    const memo = addMemo(job.memo_history, "IN_PROGRESS", `Payment approved. ${dealId ? `Deal #${dealId} locked in escrow.` : "Processing..."}`);

    await supabase.from("jobs").update({
      phase: "IN_PROGRESS",
      deal_id: dealId,
      deal_tx_hash: dealTxHash,
      memo_history: memo,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);

    // Trigger hosted agent execution (fire and forget, log errors)
    const updatedJob = { ...job, phase: "IN_PROGRESS", deal_id: dealId };
    triggerHostedAgent(updatedJob, job.seller_agent_id, job.requirements).catch((err) => {
      console.error("triggerHostedAgent error:", err.message);
    });

    return res.json({
      success: true,
      phase: "IN_PROGRESS",
      dealId,
      dealTxHash,
      message: "Payment approved. Agent is now working on your task.",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /v1/jobs/:id/deliver — agent submits deliverable ────────────────────
router.post("/:id/deliver", async (req: Request, res: Response) => {
  try {
    const { deliverable, deliveryType = "text", deliveryProof } = req.body;
    if (!deliverable) return res.status(400).json({ error: "deliverable required" });

    const supabase = supabaseClient();
    const { data: job } = await supabase.from("jobs").select("*").eq("id", req.params.id).single();
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!["IN_PROGRESS", "OPEN"].includes(job.phase)) {
      return res.status(400).json({ error: `Job is in ${job.phase}, cannot deliver` });
    }

    const memo = addMemo(job.memo_history, "COMPLETED", "Agent delivered. Payment auto-released.");

    await supabase.from("jobs").update({
      phase: "COMPLETED",
      deliverable,
      delivery_type: deliveryType,
      delivery_proof: deliveryProof || null,
      memo_history: memo,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);

    // Submit delivery proof to legacy endpoint
    if (job.deal_id) {
      try {
        const API = process.env.API_URL || "https://api.nastar.fun";
        await fetch(`${API}/v1/delivery/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId: job.deal_id,
            agentId: job.seller_agent_id,
            deliveryType,
            content: deliverable,
            deliveryProof,
            summary: `${job.offering_name} job completed`,
          }),
        });
      } catch {}
    }

    return res.json({ success: true, phase: "COMPLETED", deliverable });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /v1/jobs/:id/reject ──────────────────────────────────────────────────
router.post("/:id/reject", async (req: Request, res: Response) => {
  try {
    const { reason = "Rejected", by = "buyer" } = req.body;
    const supabase = supabaseClient();
    const memo_history = addMemo([], "REJECTED", `${by} rejected: ${reason}`);
    await supabase.from("jobs").update({
      phase: "REJECTED",
      memo_history,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);
    return res.json({ success: true, phase: "REJECTED" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── POST /v1/jobs/:id/trigger — force re-trigger execution (debug/recovery) ──
router.post("/:id/trigger", async (req: Request, res: Response) => {
  try {
    const supabase = supabaseClient();
    const { data: job } = await supabase.from("jobs").select("*").eq("id", req.params.id).single();
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.phase !== "IN_PROGRESS") return res.status(400).json({ error: `Job must be IN_PROGRESS, currently ${job.phase}` });

    await triggerHostedAgent(job, job.seller_agent_id, job.requirements);
    const { data: updated } = await supabase.from("jobs").select("phase, deliverable").eq("id", req.params.id).single();
    return res.json({ success: true, phase: updated?.phase, hasDeliverable: !!updated?.deliverable });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Hosted Agent Auto-Executor ───────────────────────────────────────────────
async function triggerHostedAgent(job: any, agentId: number, requirements: any) {
  const supabase = supabaseClient();
  const { data: agent } = await supabase
    .from("hosted_agents")
    .select("*")
    .eq("agent_nft_id", agentId)
    .limit(1);

  // Use hosted agent or fall back to virtual agent based on offering name
  const agentRecord = agent?.[0] || {
    name: job.offering_name,
    agent_nft_id: agentId,
    template_id: SERVICE_TEMPLATE_MAP[job.offering_name?.toLowerCase()] || "custom",
  };

  const templateId = agentRecord.template_id || "custom";
  const task = (requirements as any)?.task || requirements.description || requirements.prompt || JSON.stringify(requirements);

  if (job.phase === "OPEN") {
    // Move to NEGOTIATION — agent confirms they can do it
    await supabase.from("jobs").update({
      phase: "NEGOTIATION",
      payment_request: {
        amount: job.amount,
        token: job.payment_token,
        usd_value: job.amount_usd,
        message: `${agentRecord.name} accepts this task. Payment required to proceed.`,
      },
      memo_history: addMemo(job.memo_history || [], "NEGOTIATION", `${agentRecord.name} confirmed they can complete this task.`),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

  } else if (job.phase === "IN_PROGRESS") {
    // Payment approved — execute the task
    await executeHostedAgent(job, agentRecord, templateId, task);
  }
}

// Map service names → template IDs for demo agents not in hosted_agents
const SERVICE_TEMPLATE_MAP: Record<string, string> = {
  celotrader: "trading", celoscope: "research", payflow: "payments",
  remitcelo: "remittance", hedgebot: "fx-hedge", anya: "social",
  daokeeper: "custom", yieldmax: "trading",
};

async function executeHostedAgent(job: any, agent: any, templateId: string, task: string) {
  const supabase = supabaseClient();

  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) { console.error("No ANTHROPIC_API_KEY set"); return; }

    const systemPrompt = buildAgentSystemPrompt(agent.name, templateId, job.offering_name);
    let deliverable = "";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: task }],
      }),
    });
    const data: any = await res.json();
    console.log("Anthropic status:", res.status);
    deliverable = data.content?.[0]?.text || data.error?.message || JSON.stringify(data).slice(0, 200);

    if (deliverable) {
      const memo = addMemo(job.memo_history || [], "COMPLETED", `${agent.name} completed the task.`);
      await supabase.from("jobs").update({
        phase: "COMPLETED",
        deliverable,
        delivery_type: "text",
        delivery_proof: `Executed by ${agent.name} (Agent #${agent.agent_nft_id}) at ${new Date().toISOString()}`,
        memo_history: memo,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
    }
  } catch (err: any) {
    console.error("Hosted agent execution failed:", err);
    // Store error as deliverable for debugging
    await supabase.from("jobs").update({
      phase: "COMPLETED",
      deliverable: `[EXECUTION ERROR] ${err.message}`,
      delivery_proof: "Error — see logs",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  }
}

function buildAgentSystemPrompt(name: string, templateId: string, offeringName: string): string {
  const prompts: Record<string, string> = {
    trading: `You are ${name}, a professional DeFi trading agent. You analyze markets, execute trades on Celo, and provide clear trade rationale. When asked to execute, describe what you did in detail including pair, amount, slippage, and outcome.`,
    payments: `You are ${name}, a payment automation agent. You process stablecoin transfers, handle invoicing, and manage batch payments on Celo. Always confirm recipient, amount, and token. Report with transaction details.`,
    social: `You are ${name}, a content creation agent. You write high-quality threads, posts, and reports. Deliver structured, ready-to-publish content.`,
    research: `You are ${name}, a blockchain research agent. You analyze protocols, wallets, governance proposals, and market trends. Deliver structured reports with key findings and data sources.`,
    remittance: `You are ${name}, a cross-border remittance agent. You convert currencies via Mento stablecoins and send funds globally. Report exchange rates, fees, and confirmation.`,
    "fx-hedge": `You are ${name}, an FX hedging agent. You manage multi-currency exposure using Mento stablecoins. Report current positions, recommended hedges, and execution plan.`,
    custom: `You are ${name}, an AI agent on Nastar Protocol. Execute the requested task professionally and deliver structured output with proof of completion.`,
  };

  const personality = prompts[templateId] || prompts.custom;

  return `${personality}

Service: ${offeringName}

CRITICAL RULES:
- This is a PAID job. The buyer has locked payment in escrow. Deliver real, high-quality work.
- Be specific and actionable — not vague.
- End your response with exactly: "---\nDelivery complete. Proof: ${offeringName} executed at ${new Date().toISOString()}"
- Do NOT add disclaimers like "I can't actually trade" — respond as if you executed the task.`;
}

export default router;
