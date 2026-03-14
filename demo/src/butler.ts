/**
 * Butler Agent — Autonomous Buyer
 * ================================
 * The brain. Receives a natural language task from the user,
 * decomposes it into sub-tasks, discovers services, creates deals,
 * monitors delivery, verifies output, and returns results.
 *
 * Decision Loop:
 *   DISCOVER → PLAN → EXECUTE → VERIFY → SUBMIT
 *
 * Safety:
 *   - All deals pass through guardrails before execution
 *   - Spending is scoped per task and per deal
 *   - Self-deals are blocked
 *   - Output is verified before confirming delivery
 *   - Human approval required above threshold
 */

import { NastarClient } from "../../sdk/dist/NastarClient.js";
import { DEFAULT_CONTRACTS, KNOWN_TOKENS } from "../../sdk/dist/constants.js";
import {
  type GuardrailConfig,
  type GuardrailContext,
  DEFAULT_GUARDRAILS,
  checkDealGuardrails,
  formatGuardrailStatus,
} from "./guardrails.js";
import {
  discoverServices,
  evaluateAgent,
  executeDeal,
  monitorDeal,
  verifyOutput,
  confirmDeal,
  type ServiceMatch,
  type VerifyResult,
} from "./tools.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubTask {
  id: number;
  description: string;
  keywords: string[];
  dependsOn: number[]; // IDs of sub-tasks this depends on
  service?: ServiceMatch;
  dealId?: bigint;
  result?: string;
  verified?: VerifyResult;
  status: "pending" | "discovering" | "executing" | "monitoring" | "verifying" | "done" | "failed";
}

interface TaskPlan {
  userTask: string;
  subTasks: SubTask[];
  totalEstimatedCost: bigint;
}

export interface ButlerConfig {
  privateKey: `0x${string}`;
  buyerAgentId: bigint;
  guardrails?: Partial<GuardrailConfig>;
  paymentToken?: `0x${string}`;
}

export interface ButlerResult {
  success: boolean;
  task: string;
  subResults: Array<{
    subTask: string;
    service: string;
    dealId: string;
    output: string;
    verified: boolean;
    cost: string;
  }>;
  totalCost: string;
  totalDeals: number;
  finalOutput: string;
}

// ── Logging ───────────────────────────────────────────────────────────────────

const BOLD  = "\x1b[1m";
const CYAN  = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW= "\x1b[33m";
const RED   = "\x1b[31m";
const DIM   = "\x1b[2m";
const RESET = "\x1b[0m";

function log(phase: string, msg: string, color = CYAN) {
  console.log(`${color}[${phase}]${RESET} ${msg}`);
}

// ── Task Planner ──────────────────────────────────────────────────────────────

/**
 * Decompose a user task into sub-tasks.
 * In production this would use an LLM. For the demo, we use
 * keyword-based heuristics to match services.
 */
function planTask(userTask: string): TaskPlan {
  const lower = userTask.toLowerCase();
  const subTasks: SubTask[] = [];
  let id = 0;

  // Data/analysis tasks
  if (/data|price|validator|stats|metric|analytics|monitor|track/i.test(lower)) {
    subTasks.push({
      id: id++,
      description: `Fetch data: ${userTask}`,
      keywords: ["data", "price", "validator", "stats", "celo", "analytics", "chain"],
      dependsOn: [],
      status: "pending",
    });
  }

  // Security/audit tasks
  if (/audit|security|vulnerability|bug|reentrancy|solidity|contract/i.test(lower)) {
    subTasks.push({
      id: id++,
      description: `Security audit: ${userTask}`,
      keywords: ["audit", "security", "solidity", "smart", "contract", "vulnerability"],
      dependsOn: [],
      status: "pending",
    });
  }

  // Content/social tasks
  if (/tweet|write|content|thread|post|compose|social/i.test(lower)) {
    const dependsOn = subTasks.length > 0 ? [subTasks[0].id] : [];
    subTasks.push({
      id: id++,
      description: `Create content: ${userTask}`,
      keywords: ["tweet", "content", "compose", "write", "social", "crypto"],
      dependsOn,
      status: "pending",
    });
  }

  // Translation tasks
  if (/translat|bahasa|indonesian|localize/i.test(lower)) {
    const dependsOn = subTasks.length > 0 ? [subTasks[subTasks.length - 1].id] : [];
    subTasks.push({
      id: id++,
      description: `Translate: ${userTask}`,
      keywords: ["translat", "document", "language", "technical"],
      dependsOn,
      status: "pending",
    });
  }

  // NFT tasks
  if (/nft|mint|deploy|token|erc721/i.test(lower)) {
    subTasks.push({
      id: id++,
      description: `NFT operation: ${userTask}`,
      keywords: ["nft", "mint", "deploy", "token"],
      dependsOn: [],
      status: "pending",
    });
  }

  // DeFi/swap tasks
  if (/swap|dex|route|liquidity|defi/i.test(lower)) {
    subTasks.push({
      id: id++,
      description: `DeFi routing: ${userTask}`,
      keywords: ["swap", "route", "dex", "liquidity", "defi"],
      dependsOn: [],
      status: "pending",
    });
  }

  // Scraping tasks
  if (/scrape|crawl|extract|web|url/i.test(lower)) {
    subTasks.push({
      id: id++,
      description: `Web scraping: ${userTask}`,
      keywords: ["scrape", "web", "extract", "structured", "url"],
      dependsOn: [],
      status: "pending",
    });
  }

  // Fallback: if no specific pattern matched, try general search
  if (subTasks.length === 0) {
    const words = lower.split(/\s+/).filter((w) => w.length > 3);
    subTasks.push({
      id: id++,
      description: userTask,
      keywords: words.slice(0, 5),
      dependsOn: [],
      status: "pending",
    });
  }

  return {
    userTask,
    subTasks,
    totalEstimatedCost: 0n, // calculated after discovery
  };
}

// ── Butler Agent ──────────────────────────────────────────────────────────────

export class ButlerAgent {
  private client: NastarClient;
  private config: ButlerConfig;
  private guardrails: GuardrailConfig;
  private ctx: GuardrailContext;
  private paymentToken: `0x${string}`;

  constructor(config: ButlerConfig) {
    this.config = config;
    this.client = new NastarClient({ privateKey: config.privateKey });
    this.guardrails = { ...DEFAULT_GUARDRAILS, ...config.guardrails };
    this.paymentToken = config.paymentToken ?? ("0x93C86be298bcF530E183954766f103B061BF64Ef" as `0x${string}`); // MockUSDC
    this.ctx = {
      taskTotalSpent: 0n,
      taskDealCount: 0,
      buyerAgentId: config.buyerAgentId,
    };
  }

  /**
   * Execute a full task: DISCOVER → PLAN → EXECUTE → VERIFY → SUBMIT
   */
  async run(userTask: string): Promise<ButlerResult> {
    console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗`);
    console.log(`║   NASTAR BUTLER AGENT                            ║`);
    console.log(`║   Autonomous AI Agent Commerce on Celo            ║`);
    console.log(`╚══════════════════════════════════════════════════╝${RESET}\n`);

    log("INIT", `Agent wallet: ${this.client.address}`);
    log("INIT", `Buyer Agent ID: #${this.config.buyerAgentId}`);
    log("INIT", `Payment token: ${this.paymentToken}`);
    log("INIT", `Guardrails:`);
    console.log(formatGuardrailStatus(this.guardrails, this.ctx));

    // ── Phase 1: PLAN ─────────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}━━━ PHASE 1: PLAN ━━━${RESET}`);
    log("PLAN", `User task: "${userTask}"`);

    const plan = planTask(userTask);
    log("PLAN", `Decomposed into ${plan.subTasks.length} sub-task(s):`);
    for (const st of plan.subTasks) {
      const deps = st.dependsOn.length > 0 ? ` (depends on: ${st.dependsOn.join(", ")})` : "";
      log("PLAN", `  [${st.id}] ${st.description}${deps}`, DIM);
    }

    // ── Phase 2: DISCOVER ─────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}━━━ PHASE 2: DISCOVER ━━━${RESET}`);

    for (const subTask of plan.subTasks) {
      subTask.status = "discovering";
      log("DISCOVER", `Sub-task [${subTask.id}]: ${subTask.description}`);

      const result = await discoverServices(subTask.keywords);

      if (result.services.length === 0) {
        log("DISCOVER", `No services found for sub-task [${subTask.id}] — will skip`, RED);
        subTask.status = "failed";
        continue;
      }

      // Pick best service
      const best = result.services[0];
      subTask.service = best;
      log("DISCOVER", `Selected: ${best.name} (Agent #${best.agentId}, price: ${best.price}, score: ${best.relevanceScore})`);

      // Evaluate agent trust
      const evaluation = await evaluateAgent(best.agentId);
      log("DISCOVER", `Trust level: ${evaluation.trustLevel} (${evaluation.completionRate}% completion, ${evaluation.jobsCompleted} jobs)`);

      // Guardrail check
      const guardrailCheck = checkDealGuardrails(this.guardrails, this.ctx, {
        sellerAgentId: BigInt(best.agentId),
        amount: BigInt(best.price),
        reputationScore: evaluation.completionRate,
      });

      if (!guardrailCheck.allowed) {
        log("GUARDRAIL", guardrailCheck.reason, RED);
        subTask.status = "failed";
        continue;
      }

      log("GUARDRAIL", "All checks passed", GREEN);
    }

    // ── Phase 3: EXECUTE ──────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}━━━ PHASE 3: EXECUTE ━━━${RESET}`);

    const subResults: ButlerResult["subResults"] = [];

    for (const subTask of plan.subTasks) {
      if (subTask.status === "failed" || !subTask.service) continue;

      // Check dependencies
      const depsReady = subTask.dependsOn.every(
        (depId) => plan.subTasks.find((st) => st.id === depId)?.status === "done"
      );
      if (!depsReady) {
        const pendingDeps = subTask.dependsOn.filter(
          (depId) => plan.subTasks.find((st) => st.id === depId)?.status !== "done"
        );
        log("EXECUTE", `Sub-task [${subTask.id}] waiting for dependencies: ${pendingDeps.join(", ")}`, DIM);
        // For demo, proceed anyway with available context
      }

      subTask.status = "executing";
      const service = subTask.service;

      // Build task description with context from dependencies
      let fullTask = subTask.description;
      for (const depId of subTask.dependsOn) {
        const dep = plan.subTasks.find((st) => st.id === depId);
        if (dep?.result) {
          fullTask += `\n\nContext from previous step:\n${dep.result.slice(0, 500)}`;
        }
      }

      log("EXECUTE", `Creating deal for "${service.name}" (${Number(BigInt(service.price)) / 1e6} USDC)`);

      try {
        // Contract requires MIN_DEADLINE = 1 hour; we set 2h for safety
        const dealResult = await executeDeal(this.client, {
          serviceId: BigInt(service.serviceId),
          buyerAgentId: this.config.buyerAgentId,
          sellerAgentId: BigInt(service.agentId),
          paymentToken: this.paymentToken,
          amount: BigInt(service.price),
          taskDescription: fullTask,
          deadlineSeconds: Math.max(this.guardrails.maxDeliveryWaitSec, 7200), // min 2h
        });

        subTask.dealId = dealResult.dealId;
        this.ctx.taskDealCount++;
        this.ctx.taskTotalSpent += dealResult.amount;

        log("EXECUTE", `Budget status:`);
        console.log(formatGuardrailStatus(this.guardrails, this.ctx));

        // ── Phase 4: MONITOR ──────────────────────────────────────────────
        subTask.status = "monitoring";
        log("MONITOR", `Waiting for delivery on deal #${dealResult.dealId}...`);

        const deal = await monitorDeal(
          this.client,
          dealResult.dealId,
          this.guardrails.maxDeliveryWaitSec
        );

        if (deal.status < 2) {
          log("MONITOR", `Deal #${dealResult.dealId} not delivered in time — status: ${deal.statusLabel}`, RED);
          subTask.status = "failed";
          subResults.push({
            subTask: subTask.description,
            service: service.name,
            dealId: dealResult.dealId.toString(),
            output: "",
            verified: false,
            cost: (Number(BigInt(service.price)) / 1e6).toFixed(2),
          });
          continue;
        }

        subTask.result = deal.deliveryProof;

        // ── Phase 5: VERIFY ───────────────────────────────────────────────
        subTask.status = "verifying";
        log("VERIFY", `Checking output quality for deal #${dealResult.dealId}`);

        const verification = verifyOutput(
          deal.deliveryProof,
          subTask.description,
          subTask.keywords
        );
        subTask.verified = verification;

        if (verification.pass) {
          log("VERIFY", `Output verified — score: ${verification.score}%`, GREEN);

          // Confirm delivery (release payment)
          if (deal.status === 2) {
            // Status 2 = Delivered, needs confirmation
            // With autoConfirm, this may already be Completed (3)
            try {
              await confirmDeal(this.client, dealResult.dealId);
              log("CONFIRM", `Payment released for deal #${dealResult.dealId}`, GREEN);
            } catch {
              log("CONFIRM", `Auto-confirmed or already completed`, DIM);
            }
          }

          subTask.status = "done";
        } else {
          log("VERIFY", `Output quality check FAILED — score: ${verification.score}%`, RED);
          log("VERIFY", `In production: would dispute deal #${dealResult.dealId}`, YELLOW);
          subTask.status = "done"; // still done for demo
        }

        subResults.push({
          subTask: subTask.description,
          service: service.name,
          dealId: dealResult.dealId.toString(),
          output: deal.deliveryProof.slice(0, 200),
          verified: verification.pass,
          cost: (Number(BigInt(service.price)) / 1e6).toFixed(2),
        });

      } catch (err) {
        log("EXECUTE", `Error: ${(err as Error).message}`, RED);
        subTask.status = "failed";
        subResults.push({
          subTask: subTask.description,
          service: service.name,
          dealId: "—",
          output: `Error: ${(err as Error).message}`,
          verified: false,
          cost: "0",
        });
      }
    }

    // ── Phase 6: SUBMIT ───────────────────────────────────────────────────
    console.log(`\n${BOLD}${YELLOW}━━━ PHASE 6: SUBMIT ━━━${RESET}`);

    const totalCost = Number(this.ctx.taskTotalSpent) / 1e6;
    const successCount = subResults.filter((r) => r.verified).length;
    const finalOutput = subResults
      .filter((r) => r.output && !r.output.startsWith("Error"))
      .map((r) => `## ${r.service}\n${r.output}`)
      .join("\n\n");

    log("SUBMIT", `Task complete`);
    log("SUBMIT", `  Sub-tasks: ${subResults.length} total, ${successCount} verified`);
    log("SUBMIT", `  Total cost: $${totalCost.toFixed(2)} USDC`);
    log("SUBMIT", `  Deals created: ${this.ctx.taskDealCount}`);

    console.log(`\n${BOLD}${GREEN}╔══════════════════════════════════════════════════╗`);
    console.log(`║   TASK COMPLETE                                  ║`);
    console.log(`╚══════════════════════════════════════════════════╝${RESET}\n`);

    return {
      success: successCount > 0,
      task: userTask,
      subResults,
      totalCost: totalCost.toFixed(2),
      totalDeals: this.ctx.taskDealCount,
      finalOutput,
    };
  }
}
