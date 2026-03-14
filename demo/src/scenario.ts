/**
 * Demo Scenario — End-to-End Agent Commerce
 * ===========================================
 * Runs the complete decision loop:
 *   DISCOVER → PLAN → EXECUTE → VERIFY → SUBMIT
 *
 * Starts both the Seller Agent (auto-responds) and Butler Agent (buyer brain),
 * then executes a real task through the Nastar marketplace.
 *
 * Usage:
 *   source ~/.openclaw/workspace/.env.wallet
 *   npx tsx demo/src/scenario.ts
 *
 * What happens:
 *   1. Seller Agent starts watching for deals (Agent #40)
 *   2. Butler Agent receives a user task
 *   3. Butler discovers relevant services on the marketplace
 *   4. Butler checks agent reputation (on-chain)
 *   5. Guardrails validate: budget, trust, self-deal prevention
 *   6. Butler creates deal(s) with on-chain escrow
 *   7. Seller auto-accepts, executes, delivers
 *   8. Butler verifies output quality
 *   9. Butler confirms delivery (releases payment)
 *   10. Final result returned to user
 *
 * All steps are real on-chain transactions on Celo Sepolia.
 */

import "dotenv/config";
import { ButlerAgent } from "./butler.js";
import { SellerAgent } from "./seller-agent.js";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Config ────────────────────────────────────────────────────────────────────

const BOLD  = "\x1b[1m";
const CYAN  = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW= "\x1b[33m";
const RED   = "\x1b[31m";
const RESET = "\x1b[0m";

// Seller = main wallet (Agent #40, owns the services)
const SELLER_PK = process.env.PRIVATE_KEY as `0x${string}`;
if (!SELLER_PK) {
  console.error("Error: PRIVATE_KEY env var required (seller agent wallet)");
  process.exit(1);
}

// Buyer = derived wallet (Agent #45)
const BUYER_PK = keccak256(
  toBytes(SELLER_PK + "nastar-demo-buyer")
) as `0x${string}`;

const SELLER_AGENT_ID = 40n;
const BUYER_AGENT_ID = 45n;

// ── Demo Scenarios ────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: "Multi-Agent Chain: Data → Content",
    task: "Analyze the top Celo validators and write a tweet thread about the network health",
    description: "Butler discovers CeloDataFeed + TweetComposer, chains them: data first, then content using the data as context.",
  },
  {
    name: "Security Audit",
    task: "Audit a Solidity smart contract for reentrancy vulnerabilities and common security issues",
    description: "Butler discovers SmartAuditor, creates a single deal, verifies the audit report quality.",
  },
  {
    name: "Cross-Language Content",
    task: "Write a tweet about Celo and translate it to Indonesian",
    description: "Butler chains TweetComposer → DocTranslator. Content creation then localization.",
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const scenarioIdx = parseInt(process.env.SCENARIO ?? "0");
  const scenario = SCENARIOS[scenarioIdx] ?? SCENARIOS[0];

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   NASTAR END-TO-END AGENT DEMO                         ║`);
  console.log(`║   Trustless AI Agent Commerce on Celo                   ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║                                                        ║`);
  console.log(`║   Scenario: ${scenario.name.padEnd(42)}║`);
  console.log(`║                                                        ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${RESET}\n`);

  console.log(`${DIM}${scenario.description}${RESET}\n`);

  const buyerAccount = privateKeyToAccount(BUYER_PK);
  const sellerAccount = privateKeyToAccount(SELLER_PK);

  console.log(`${YELLOW}Agents:${RESET}`);
  console.log(`  Seller: Agent #${SELLER_AGENT_ID} — ${sellerAccount.address}`);
  console.log(`  Buyer:  Agent #${BUYER_AGENT_ID} — ${buyerAccount.address}`);
  console.log(`  Chain:  Celo Sepolia (11142220)`);
  console.log(`  Escrow: 0xEE51...34AF`);
  console.log();

  // Start Seller Agent in background
  console.log(`${GREEN}Starting Seller Agent...${RESET}`);
  const seller = new SellerAgent({
    privateKey: SELLER_PK,
    sellerAgentId: SELLER_AGENT_ID,
  });
  const sellerPromise = seller.start();

  // Wait for seller to start watching
  await new Promise((r) => setTimeout(r, 3_000));

  // Start Butler Agent
  console.log(`${GREEN}Starting Butler Agent...${RESET}\n`);
  const butler = new ButlerAgent({
    privateKey: BUYER_PK,
    buyerAgentId: BUYER_AGENT_ID,
    guardrails: {
      maxSpendPerTask: 50_000000n,  // 50 USDC for demo
      maxSpendPerDeal: 25_000000n,
      maxDealsPerTask: 5,
      blockedAgentIds: [BUYER_AGENT_ID], // can't hire itself
      verifyBeforeConfirm: true,
      minReputationScore: 0,  // allow all for demo (new agents have 0)
      maxDeliveryWaitSec: 120,
    },
  });

  // Execute the task
  console.log(`${BOLD}${YELLOW}User Task: "${scenario.task}"${RESET}\n`);

  const result = await butler.run(scenario.task);

  // Print final report
  console.log(`\n${BOLD}${CYAN}━━━ FINAL REPORT ━━━${RESET}`);
  console.log(`${BOLD}Task:${RESET} ${result.task}`);
  console.log(`${BOLD}Success:${RESET} ${result.success ? `${GREEN}YES${RESET}` : `${RED}NO${RESET}`}`);
  console.log(`${BOLD}Total Cost:${RESET} $${result.totalCost} USDC`);
  console.log(`${BOLD}Deals Created:${RESET} ${result.totalDeals}`);
  console.log();

  for (const sub of result.subResults) {
    console.log(`  ${sub.verified ? GREEN + "✓" : RED + "✗"}${RESET} ${sub.service} — Deal #${sub.dealId} — $${sub.cost}`);
    if (sub.output) {
      console.log(`    ${DIM}${sub.output.slice(0, 100)}...${RESET}`);
    }
  }

  if (result.finalOutput) {
    console.log(`\n${BOLD}${CYAN}━━━ COMBINED OUTPUT ━━━${RESET}`);
    console.log(result.finalOutput.slice(0, 500));
    if (result.finalOutput.length > 500) console.log(`\n${DIM}... (${result.finalOutput.length} chars total)${RESET}`);
  }

  // Cleanup
  seller.stop();
  console.log(`\n${GREEN}Demo complete.${RESET}`);
  process.exit(0);
}

const DIM = "\x1b[2m";

main().catch((err) => {
  console.error(`${RED}Demo error:${RESET}`, err.message ?? err);
  process.exit(1);
});
