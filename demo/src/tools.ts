/**
 * Agent Tools
 * ===========
 * Multi-tool orchestration layer. Each tool is a discrete capability
 * the Butler agent can invoke during the decision loop.
 *
 * Tools:
 *   1. discover  — query marketplace for relevant services
 *   2. evaluate  — check agent reputation & trustworthiness
 *   3. execute   — create deal + escrow payment on-chain
 *   4. monitor   — poll deal status until delivery
 *   5. verify    — validate output quality
 *   6. confirm   — confirm delivery (release payment)
 */

import { NastarClient } from "../../sdk/dist/NastarClient.js";
import type { Service, Deal } from "../../sdk/dist/types.js";

const API_BASE = "https://api-production-a473.up.railway.app";

// ── Tool 1: Discover ──────────────────────────────────────────────────────────

export interface DiscoverResult {
  services: ServiceMatch[];
  totalFound: number;
}

export interface ServiceMatch {
  serviceId: number;
  name: string;
  description: string;
  price: string;
  agentId: number;
  relevanceScore: number; // 0-100
}

/**
 * Discover services matching a task description.
 * Queries the API and scores relevance by keyword matching.
 */
export async function discoverServices(
  taskKeywords: string[]
): Promise<DiscoverResult> {
  console.log(`  [discover] Searching marketplace for: ${taskKeywords.join(", ")}`);

  const res = await fetch(`${API_BASE}/v1/services`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const services: Array<{
    serviceId: number;
    agentId: number;
    name: string;
    description: string;
    pricePerCall: string;
  }> = await res.json();

  // Score relevance
  const scored: ServiceMatch[] = services.map((s) => {
    const text = `${s.name} ${s.description}`.toLowerCase();
    const matches = taskKeywords.filter((kw) => text.includes(kw.toLowerCase()));
    const relevanceScore = Math.round((matches.length / taskKeywords.length) * 100);

    // API returns formatted USDC (e.g. "2.0") — convert to raw units (6 decimals)
    const priceRaw = BigInt(Math.round(parseFloat(s.pricePerCall) * 1_000_000));

    return {
      serviceId: s.serviceId,
      name: s.name,
      description: s.description,
      price: priceRaw.toString(),
      agentId: s.agentId,
      relevanceScore,
    };
  });

  // Sort by relevance, filter out zero matches
  const matches = scored
    .filter((s) => s.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  console.log(`  [discover] Found ${matches.length}/${services.length} relevant services`);
  for (const m of matches.slice(0, 3)) {
    console.log(`    - ${m.name} (score: ${m.relevanceScore}, price: ${m.price})`);
  }

  return { services: matches, totalFound: services.length };
}

// ── Tool 2: Evaluate ──────────────────────────────────────────────────────────

export interface AgentEvaluation {
  agentId: number;
  name: string;
  revenue: string;
  jobsCompleted: number;
  completionRate: number;
  trustLevel: "high" | "medium" | "low" | "new";
}

/**
 * Evaluate an agent's trustworthiness based on on-chain reputation.
 */
export async function evaluateAgent(agentId: number): Promise<AgentEvaluation> {
  console.log(`  [evaluate] Checking reputation of Agent #${agentId}`);

  const res = await fetch(`${API_BASE}/v1/leaderboard`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const leaderboard: Array<{
    agentId: number;
    name: string;
    revenue: string;
    jobsCompleted: number;
    completionRate: number;
  }> = await res.json();

  const agent = leaderboard.find((a) => a.agentId === agentId);

  if (!agent) {
    console.log(`  [evaluate] Agent #${agentId} not found in leaderboard — NEW agent`);
    return {
      agentId,
      name: `Agent #${agentId}`,
      revenue: "0",
      jobsCompleted: 0,
      completionRate: 0,
      trustLevel: "new",
    };
  }

  const trustLevel: AgentEvaluation["trustLevel"] =
    agent.completionRate >= 90 && agent.jobsCompleted >= 5
      ? "high"
      : agent.completionRate >= 70 && agent.jobsCompleted >= 2
        ? "medium"
        : agent.jobsCompleted === 0
          ? "new"
          : "low";

  console.log(
    `  [evaluate] ${agent.name}: ${agent.jobsCompleted} jobs, ` +
      `${agent.completionRate}% completion, $${agent.revenue} revenue → ${trustLevel} trust`
  );

  return {
    agentId,
    name: agent.name,
    revenue: agent.revenue,
    jobsCompleted: agent.jobsCompleted,
    completionRate: agent.completionRate,
    trustLevel,
  };
}

// ── Tool 3: Execute ───────────────────────────────────────────────────────────

export interface ExecuteResult {
  dealId: bigint;
  txHash: string;
  serviceId: bigint;
  amount: bigint;
}

/**
 * Create a deal on-chain: approve token spend → create escrow deal.
 */
export async function executeDeal(
  client: NastarClient,
  params: {
    serviceId: bigint;
    buyerAgentId: bigint;
    sellerAgentId: bigint;
    paymentToken: `0x${string}`;
    amount: bigint;
    taskDescription: string;
    deadlineSeconds: number;
  }
): Promise<ExecuteResult> {
  console.log(`  [execute] Creating deal for service #${params.serviceId}`);
  console.log(`  [execute] Amount: ${Number(params.amount) / 1e6} USDC, deadline: ${params.deadlineSeconds}s`);

  const result = await client.createDeal({
    serviceId: params.serviceId,
    buyerAgentId: params.buyerAgentId,
    sellerAgentId: params.sellerAgentId,
    paymentToken: params.paymentToken,
    amount: params.amount,
    taskDescription: params.taskDescription,
    deadlineSeconds: params.deadlineSeconds,
  });

  console.log(`  [execute] Deal #${result.dealId} created: ${result.txHash}`);
  console.log(`  [execute] https://sepolia.celoscan.io/tx/${result.txHash}`);

  return {
    dealId: result.dealId,
    txHash: result.txHash,
    serviceId: params.serviceId,
    amount: params.amount,
  };
}

// ── Tool 4: Monitor ───────────────────────────────────────────────────────────

/**
 * Poll deal status until delivery or timeout.
 */
export async function monitorDeal(
  client: NastarClient,
  dealId: bigint,
  timeoutSec: number = 300
): Promise<Deal> {
  console.log(`  [monitor] Watching deal #${dealId} (timeout: ${timeoutSec}s)`);

  const start = Date.now();
  const pollInterval = 10_000; // 10s

  while (true) {
    const deal = await client.getDeal(dealId);
    const elapsed = Math.round((Date.now() - start) / 1000);

    if (deal.status >= 2) {
      // Delivered, Completed, or beyond
      console.log(`  [monitor] Deal #${dealId} → ${deal.statusLabel} (${elapsed}s)`);
      return deal;
    }

    if (Date.now() - start > timeoutSec * 1000) {
      console.log(`  [monitor] Deal #${dealId} TIMEOUT after ${elapsed}s (status: ${deal.statusLabel})`);
      return deal;
    }

    console.log(`  [monitor] Deal #${dealId}: ${deal.statusLabel} (${elapsed}s elapsed)`);
    await new Promise((r) => setTimeout(r, pollInterval));
  }
}

// ── Tool 5: Verify ────────────────────────────────────────────────────────────

export interface VerifyResult {
  pass: boolean;
  score: number;
  checks: { name: string; pass: boolean; detail: string }[];
}

/**
 * Verify output quality against task requirements.
 */
export function verifyOutput(
  output: string,
  taskDescription: string,
  expectedKeywords: string[] = []
): VerifyResult {
  console.log(`  [verify] Checking output quality (${output.length} chars)`);

  const checks: VerifyResult["checks"] = [];

  // Check 1: Non-empty
  const nonEmpty = output.trim().length > 0;
  checks.push({ name: "non-empty", pass: nonEmpty, detail: nonEmpty ? "Has content" : "Empty output" });

  // Check 2: Minimum length
  const minLen = output.length >= 50;
  checks.push({ name: "min-length", pass: minLen, detail: `${output.length} chars (min: 50)` });

  // Check 3: No error patterns
  const hasError = /error|failed|unauthorized|rate.?limit/i.test(output);
  checks.push({ name: "no-errors", pass: !hasError, detail: hasError ? "Contains error pattern" : "Clean" });

  // Check 4: Keyword coverage
  if (expectedKeywords.length > 0) {
    const lower = output.toLowerCase();
    const found = expectedKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
    const coverage = Math.round((found.length / expectedKeywords.length) * 100);
    checks.push({
      name: "keyword-coverage",
      pass: coverage >= 50,
      detail: `${found.length}/${expectedKeywords.length} keywords found (${coverage}%)`,
    });
  }

  // Check 5: Looks like structured data (JSON parseable or markdown-like)
  const structured = output.startsWith("{") || output.startsWith("[") || output.includes("##") || output.includes("- ");
  checks.push({ name: "structured", pass: structured, detail: structured ? "Structured format" : "Freeform text" });

  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  const pass = score >= 60;

  console.log(`  [verify] Score: ${score}% (${passed}/${checks.length} checks passed) → ${pass ? "PASS" : "FAIL"}`);
  for (const c of checks) {
    console.log(`    ${c.pass ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  }

  return { pass, score, checks };
}

// ── Tool 6: Confirm ───────────────────────────────────────────────────────────

/**
 * Confirm delivery — releases escrowed payment to seller.
 */
export async function confirmDeal(
  client: NastarClient,
  dealId: bigint
): Promise<string> {
  console.log(`  [confirm] Confirming delivery for deal #${dealId}`);
  const hash = await client.confirmDelivery(dealId);
  console.log(`  [confirm] Payment released: ${hash}`);
  return hash;
}
