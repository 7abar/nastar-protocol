/**
 * Safety Guardrails
 * =================
 * Scoped spending limits, human approval gates, blocklists,
 * loop prevention, and output verification requirements.
 *
 * Every agent action passes through these checks before execution.
 */

export interface GuardrailConfig {
  /** Max total spend per task in token units (e.g. 10_000000 = 10 USDC) */
  maxSpendPerTask: bigint;
  /** Max spend per single deal */
  maxSpendPerDeal: bigint;
  /** Threshold above which human approval is required */
  requireHumanApprovalAbove: bigint;
  /** Max number of deals per task (prevent infinite loops) */
  maxDealsPerTask: number;
  /** Agent IDs the buyer cannot hire (e.g. itself) */
  blockedAgentIds: bigint[];
  /** Always verify output before confirming delivery */
  verifyBeforeConfirm: boolean;
  /** Min reputation score (0-100) to trust an agent */
  minReputationScore: number;
  /** Max time to wait for delivery (seconds) */
  maxDeliveryWaitSec: number;
}

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxSpendPerTask: 10_000000n,       // 10 USDC
  maxSpendPerDeal: 5_000000n,        // 5 USDC per deal
  requireHumanApprovalAbove: 25_000000n, // >25 USDC needs human
  maxDealsPerTask: 5,
  blockedAgentIds: [],
  verifyBeforeConfirm: true,
  minReputationScore: 50,
  maxDeliveryWaitSec: 300,           // 5 min
};

export interface GuardrailContext {
  taskTotalSpent: bigint;
  taskDealCount: number;
  buyerAgentId: bigint;
}

export type GuardrailResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Check if a proposed deal passes all guardrails.
 */
export function checkDealGuardrails(
  config: GuardrailConfig,
  ctx: GuardrailContext,
  proposed: {
    sellerAgentId: bigint;
    amount: bigint;
    reputationScore: number;
  }
): GuardrailResult {
  // 1. Self-deal prevention
  if (proposed.sellerAgentId === ctx.buyerAgentId) {
    return { allowed: false, reason: "BLOCKED: Cannot hire yourself (self-deal)" };
  }

  // 2. Blocked agent check
  if (config.blockedAgentIds.includes(proposed.sellerAgentId)) {
    return { allowed: false, reason: `BLOCKED: Agent #${proposed.sellerAgentId} is on blocklist` };
  }

  // 3. Per-deal spend limit
  if (proposed.amount > config.maxSpendPerDeal) {
    return {
      allowed: false,
      reason: `LIMIT: Deal cost ${proposed.amount} exceeds per-deal max ${config.maxSpendPerDeal}`,
    };
  }

  // 4. Per-task total spend limit
  const newTotal = ctx.taskTotalSpent + proposed.amount;
  if (newTotal > config.maxSpendPerTask) {
    return {
      allowed: false,
      reason: `LIMIT: Total spend ${newTotal} would exceed task max ${config.maxSpendPerTask}`,
    };
  }

  // 5. Deal count limit (loop prevention)
  if (ctx.taskDealCount >= config.maxDealsPerTask) {
    return {
      allowed: false,
      reason: `LIMIT: Already created ${ctx.taskDealCount} deals (max: ${config.maxDealsPerTask})`,
    };
  }

  // 6. Reputation check
  if (proposed.reputationScore < config.minReputationScore) {
    return {
      allowed: false,
      reason: `TRUST: Agent reputation ${proposed.reputationScore}% below minimum ${config.minReputationScore}%`,
    };
  }

  // 7. Human approval gate
  if (proposed.amount > config.requireHumanApprovalAbove) {
    return {
      allowed: false,
      reason: `APPROVAL: Amount ${proposed.amount} requires human approval (threshold: ${config.requireHumanApprovalAbove})`,
    };
  }

  return { allowed: true };
}

/**
 * Verify output quality — returns pass/fail with reason.
 */
export function checkOutputQuality(
  output: string,
  taskDescription: string
): { pass: boolean; reason: string } {
  // Basic checks
  if (!output || output.trim().length === 0) {
    return { pass: false, reason: "Empty output" };
  }

  if (output.length < 20) {
    return { pass: false, reason: `Output too short (${output.length} chars)` };
  }

  // Check for error patterns
  const errorPatterns = [
    /^error:/i,
    /^failed:/i,
    /internal server error/i,
    /rate limit/i,
    /unauthorized/i,
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(output)) {
      return { pass: false, reason: `Output contains error pattern: ${pattern.source}` };
    }
  }

  return { pass: true, reason: "Output passes basic quality checks" };
}

/**
 * Format guardrail status for logging.
 */
export function formatGuardrailStatus(
  config: GuardrailConfig,
  ctx: GuardrailContext
): string {
  const spent = Number(ctx.taskTotalSpent) / 1e6;
  const max = Number(config.maxSpendPerTask) / 1e6;
  const pct = max > 0 ? Math.round((spent / max) * 100) : 0;

  return [
    `  Budget: $${spent.toFixed(2)} / $${max.toFixed(2)} (${pct}%)`,
    `  Deals: ${ctx.taskDealCount} / ${config.maxDealsPerTask}`,
    `  Verify: ${config.verifyBeforeConfirm ? "ON" : "OFF"}`,
    `  Min reputation: ${config.minReputationScore}%`,
  ].join("\n");
}
