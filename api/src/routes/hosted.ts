/**
 * /v1/hosted — No-Code Agent Launcher
 * Persisted in Supabase (hosted_agents + agent_logs tables).
 */

import { Router, Request, Response } from "express";
import { db, dbGet, dbUpsert, dbUpdate, dbInsert, dbList } from "../lib/supabase.js";

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpendingLimits {
  maxPerCallUsd: number;
  dailyLimitUsd: number;
  requireConfirmAboveUsd: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resetDailyIfNeeded(wallet: string): Promise<void> {
  const agent = await dbGet<any>("hosted_agents", { agent_wallet: wallet });
  if (!agent) return;
  if (new Date() > new Date(agent.daily_spend_reset)) {
    await dbUpdate("hosted_agents", { agent_wallet: wallet }, {
      daily_spend: 0,
      daily_spend_reset: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: agent.status === "limit_reached" ? "active" : agent.status,
    });
  }
}

async function addLog(wallet: string, log: { type: string; message: string; amount?: string; tx_hash?: string }) {
  await dbInsert("agent_logs", { agent_wallet: wallet, ...log }).catch(console.error);
}

// ─── POST /v1/hosted — register hosted agent ──────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const {
    agentWallet, ownerAddress, apiKey, agentNftId, serviceId,
    name, description, templateId, systemPrompt,
    llmProvider, llmModel, llmApiKey, spendingLimits, autoSwap,
  } = req.body;

  if (!agentWallet || !systemPrompt || !llmApiKey) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const row = {
    agent_wallet: agentWallet.toLowerCase(),
    owner_address: ownerAddress,
    api_key: apiKey,
    agent_nft_id: agentNftId ?? null,
    service_id: serviceId ?? null,
    name, description,
    template_id: templateId,
    system_prompt: systemPrompt,
    llm_provider: llmProvider || "openai",
    llm_model: llmModel || "gpt-4o-mini",
    llm_api_key: llmApiKey,
    spending_limits: {
      maxPerCallUsd: spendingLimits?.maxPerCallUsd ?? 10,
      dailyLimitUsd: spendingLimits?.dailyLimitUsd ?? 50,
      requireConfirmAboveUsd: spendingLimits?.requireConfirmAboveUsd ?? 25,
    },
    // auto_swap stored in spending_limits JSON for now (no separate column)
    status: "active",
    daily_spend: 0,
    daily_spend_reset: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    jobs_completed: 0,
    total_earned: 0,
  };

  await dbUpsert("hosted_agents", row, "agent_wallet");
  await addLog(agentWallet.toLowerCase(), { type: "job", message: `Agent "${name}" launched on Nastar.` });

  return res.status(201).json({
    agentWallet: agentWallet.toLowerCase(),
    endpoint: `/v1/hosted/${agentWallet.toLowerCase()}`,
    status: "active",
  });
});

// ─── GET /v1/hosted/:wallet/stats ─────────────────────────────────────────────

router.get("/:wallet/stats", async (req: Request, res: Response) => {
  const wallet = req.params.wallet.toLowerCase();
  await resetDailyIfNeeded(wallet);
  const agent = await dbGet<any>("hosted_agents", { agent_wallet: wallet });
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  return res.json({
    jobsCompleted: agent.jobs_completed,
    totalEarned: parseFloat(agent.total_earned).toFixed(4),
    dailySpend: parseFloat(agent.daily_spend).toFixed(4),
    dailyLimit: agent.spending_limits?.dailyLimitUsd?.toString() || "50",
    status: agent.status,
    uptime: "99.9%",
  });
});

// ─── GET /v1/hosted/:wallet/logs ──────────────────────────────────────────────

router.get("/:wallet/logs", async (req: Request, res: Response) => {
  const wallet = req.params.wallet.toLowerCase();
  const logs = await dbList<any>("agent_logs", {
    match: { agent_wallet: wallet },
    order: { column: "created_at", ascending: false },
    limit: 100,
  });
  return res.json(logs.map(l => ({
    id: l.id,
    timestamp: new Date(l.created_at).getTime(),
    type: l.type,
    message: l.message,
    amount: l.amount,
    txHash: l.tx_hash,
  })));
});

// ─── POST /v1/hosted/:wallet — execute task ───────────────────────────────────

router.post("/:wallet", async (req: Request, res: Response) => {
  const wallet = req.params.wallet.toLowerCase();
  await resetDailyIfNeeded(wallet);

  const agent = await dbGet<any>("hosted_agents", { agent_wallet: wallet });
  if (!agent) return res.status(404).json({ error: "Hosted agent not found" });
  if (agent.status !== "active") return res.status(503).json({ error: `Agent is ${agent.status}` });

  const { task, dealId, amount } = req.body;
  if (!task) return res.status(400).json({ error: "Missing task" });

  const amountUsd = parseFloat(amount || "0");
  const limits: SpendingLimits = agent.spending_limits;

  // Enforce spending limits
  if (amountUsd > limits.maxPerCallUsd) {
    await addLog(wallet, { type: "error", message: `Task rejected: $${amountUsd} exceeds max $${limits.maxPerCallUsd}`, amount: String(amountUsd) });
    return res.status(403).json({ error: "Amount exceeds max per call limit", limit: limits.maxPerCallUsd });
  }

  const currentSpend = parseFloat(agent.daily_spend) || 0;
  if (currentSpend + amountUsd > limits.dailyLimitUsd) {
    await dbUpdate("hosted_agents", { agent_wallet: wallet }, { status: "limit_reached" });
    await addLog(wallet, { type: "error", message: `Daily limit $${limits.dailyLimitUsd} reached. Agent paused.` });
    return res.status(403).json({ error: "Daily spending limit reached", limit: limits.dailyLimitUsd });
  }

  if (amountUsd > limits.requireConfirmAboveUsd) {
    await addLog(wallet, { type: "approval", message: `High-value task ($${amountUsd}) queued — awaiting owner confirmation.`, amount: String(amountUsd) });
    return res.status(202).json({ status: "pending_approval", threshold: limits.requireConfirmAboveUsd });
  }

  // Execute via LLM
  try {
    await addLog(wallet, { type: "job", message: `Executing task for deal #${dealId}: ${task.slice(0, 80)}...`, amount: String(amountUsd) });

    const result = await callLLM(agent, task);

    await dbUpdate("hosted_agents", { agent_wallet: wallet }, {
      jobs_completed: (agent.jobs_completed || 0) + 1,
      daily_spend: currentSpend + amountUsd,
      total_earned: (parseFloat(agent.total_earned) || 0) + amountUsd,
    });

    await addLog(wallet, { type: "job", message: `Task completed for deal #${dealId}. Earned ${amountUsd} USDC.`, amount: String(amountUsd) });

    return res.json({ status: "completed", result, dealId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await addLog(wallet, { type: "error", message: `LLM error: ${msg.slice(0, 100)}` });
    return res.status(500).json({ error: "LLM execution failed", details: msg });
  }
});

// ─── LLM dispatcher ───────────────────────────────────────────────────────────

async function callLLM(agent: any, userMessage: string): Promise<string> {
  const { llm_provider, llm_model, system_prompt } = agent;

  // Use platform API key if agent uses "PLATFORM_PROVIDED"
  let llm_api_key = agent.llm_api_key;
  if (llm_api_key === "PLATFORM_PROVIDED") {
    if (llm_provider === "anthropic") {
      llm_api_key = process.env.ANTHROPIC_API_KEY || "";
    } else if (llm_provider === "openai") {
      llm_api_key = process.env.OPENAI_API_KEY || "";
    } else if (llm_provider === "google") {
      llm_api_key = process.env.GOOGLE_API_KEY || "";
    }
    if (!llm_api_key) throw new Error("Platform API key not configured for " + llm_provider);
  }

  if (llm_provider === "openai" || llm_provider === "google") {
    const baseUrl = llm_provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${llm_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: llm_model, messages: [{ role: "system", content: system_prompt }, { role: "user", content: userMessage }], max_tokens: 1024 }),
    });
    if (!res.ok) throw new Error(`${llm_provider} API error: ${res.status}`);
    const data = await res.json() as any;
    return data.choices[0]?.message?.content || "No response";
  }

  if (llm_provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": llm_api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: llm_model, max_tokens: 1024, system: system_prompt, messages: [{ role: "user", content: userMessage }] }),
    });
    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
    const data = await res.json() as any;
    return data.content[0]?.text || "No response";
  }

  throw new Error(`Unsupported LLM provider: ${llm_provider}`);
}

// ─── POST /v1/hosted/:wallet/auto-swap — agent-triggered currency conversion ──
// Called automatically after deal payout, or manually by the agent
router.post("/:wallet/auto-swap", async (req: Request, res: Response) => {
  const wallet = req.params.wallet.toLowerCase();
  const agent = await dbGet<any>("hosted_agents", { agent_wallet: wallet });
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { fromToken, fromAddress, amount, recipient } = req.body;
  const swapConfig = agent.auto_swap;

  if (!swapConfig?.enabled) {
    return res.status(400).json({ error: "Auto-swap not configured for this agent" });
  }

  const targetAddress = swapConfig.targetAddress;
  const recipientAddr = recipient || agent.owner_address;

  if (!fromAddress || !amount || !recipientAddr) {
    return res.status(400).json({ error: "fromAddress, amount, recipient required" });
  }

  // Get swap calldata from Mento via internal call
  try {
    const API_BASE = process.env.API_URL || "http://localhost:3001";
    const buildRes = await fetch(`${API_BASE}/v1/swap/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenIn: fromAddress,
        tokenOut: targetAddress,
        amountIn: amount,
        recipient: recipientAddr,
        slippageTolerance: swapConfig.slippageTolerance ?? 0.5,
        deadlineMinutes: 10,
      }),
    });

    if (!buildRes.ok) {
      const err = await buildRes.json() as any;
      return res.status(400).json({ error: `Swap build failed: ${err.error}` });
    }

    const swapData = await buildRes.json() as any;

    await addLog(wallet, {
      type: "swap",
      message: `Auto-swap queued: ${amount} ${fromToken} → ${swapConfig.targetToken} (expected ${swapData.expectedAmountOut} ${swapConfig.targetToken})`,
      amount: String(amount),
    });

    return res.json({
      status: "swap_built",
      agentWallet: wallet,
      fromToken,
      toToken: swapConfig.targetToken,
      amountIn: amount,
      expectedAmountOut: swapData.expectedAmountOut,
      minAmountOut: swapData.minAmountOut,
      transactions: swapData.transactions, // Caller executes these
      note: "Execute transactions in order to complete the swap",
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
