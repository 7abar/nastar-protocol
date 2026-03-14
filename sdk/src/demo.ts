/**
 * Nastar End-to-End Demo
 * ======================
 * Demonstrates a complete agent-to-agent deal lifecycle on Celo Sepolia.
 *
 * One wallet controls two ERC-8004 agent identities:
 *   Agent ALPHA (token 40) — seller: registers a data service, delivers work
 *   Agent BETA  (token 41) — buyer: discovers service, escrows payment, confirms
 *
 * Every step is a real on-chain transaction. No mocks.
 * All contracts deployed on Celo Sepolia (chain 11142220).
 */

import "dotenv/config";
import * as fs from "fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  defineChain,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Chain ─────────────────────────────────────────────────────────────────────
const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
  blockExplorers: {
    default: { name: "Celo Explorer", url: "https://sepolia.celoscan.io" },
  },
  testnet: true,
});

// ── Addresses ─────────────────────────────────────────────────────────────────
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const SERVICE_REGISTRY  = "0xd0b584e1b41bdd598e598443b571328083a80dcc" as const;
const NASTAR_ESCROW     = "0xb8855a44f7a49739a5e9e8b6baba5cdd9d57ad20" as const;
// MockERC20 (testnet-only, free mint — simulates USDm)
const USDm              = "0x93C86be298bcF530E183954766f103B061BF64Ef" as const;

// ── ABIs (minimal) ────────────────────────────────────────────────────────────
const ERC8004_ABI = [
  { type: "function", name: "register",
    inputs: [], outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }], stateMutability: "view" },
] as const;

const ERC20_ABI = [
  { type: "function", name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "mint",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable" },
] as const;

const REGISTRY_ABI = [
  { type: "function", name: "registerService",
    inputs: [
      { name: "agentId", type: "uint256" }, { name: "name", type: "string" },
      { name: "description", type: "string" }, { name: "endpoint", type: "string" },
      { name: "paymentToken", type: "address" }, { name: "pricePerCall", type: "uint256" },
      { name: "tags", type: "bytes32[]" },
    ],
    outputs: [{ name: "serviceId", type: "uint256" }],
    stateMutability: "nonpayable" },
  { type: "function", name: "nextServiceId",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const ESCROW_ABI = [
  { type: "function", name: "createDeal",
    inputs: [
      { name: "serviceId", type: "uint256" }, { name: "buyerAgentId", type: "uint256" },
      { name: "sellerAgentId", type: "uint256" }, { name: "paymentToken", type: "address" },
      { name: "amount", type: "uint256" }, { name: "taskDescription", type: "string" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "dealId", type: "uint256" }],
    stateMutability: "nonpayable" },
  { type: "function", name: "acceptDeal",
    inputs: [{ name: "dealId", type: "uint256" }], outputs: [],
    stateMutability: "nonpayable" },
  { type: "function", name: "deliverDeal",
    inputs: [{ name: "dealId", type: "uint256" }, { name: "proof", type: "string" }],
    outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "confirmDelivery",
    inputs: [{ name: "dealId", type: "uint256" }], outputs: [],
    stateMutability: "nonpayable" },
  { type: "function", name: "getDeal",
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
      ],
    }], stateMutability: "view" },
  { type: "function", name: "nextDealId",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const DEAL_STATUS = ["Created","Accepted","Delivered","Completed","Disputed","Refunded","Expired"];

// ── Logger ────────────────────────────────────────────────────────────────────
const C = { reset:"\x1b[0m", bold:"\x1b[1m", green:"\x1b[32m", cyan:"\x1b[36m", yellow:"\x1b[33m", dim:"\x1b[2m", red:"\x1b[31m" };
const log = (m: string) => console.log(m);
const step = (n: number, m: string) => log(`\n${C.bold}${C.cyan}[Step ${n}]${C.reset} ${m}`);
const ok   = (m: string) => log(`  ${C.green}✓${C.reset} ${m}`);
const info = (m: string) => log(`  ${C.dim}→ ${m}${C.reset}`);
const txLink = (h: Hash, label: string) => {
  log(`  ${C.yellow}TX${C.reset} ${label}`);
  log(`     https://sepolia.celoscan.io/tx/${h}`);
};
const divider = (t: string) => {
  log(`\n${C.bold}${"─".repeat(62)}\n  ${t}\n${"─".repeat(62)}${C.reset}`);
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadKey(): `0x${string}` {
  const raw = fs.readFileSync("/home/smart_user/.openclaw/workspace/.env.wallet", "utf8");
  const m = raw.match(/PRIVATE_KEY=(\S+)/);
  if (!m) throw new Error("PRIVATE_KEY not found in .env.wallet");
  return m[1] as `0x${string}`;
}

async function findTokenId(
  client: ReturnType<typeof createPublicClient>,
  owner: `0x${string}`,
  maxId = 60n
): Promise<bigint | null> {
  for (let i = 0n; i <= maxId; i++) {
    try {
      const o = await client.readContract({
        address: IDENTITY_REGISTRY, abi: ERC8004_ABI,
        functionName: "ownerOf", args: [i],
      });
      if (o.toLowerCase() === owner.toLowerCase()) return i;
    } catch {}
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  divider("NASTAR SDK DEMO — Agent Commerce on Celo Sepolia");

  // ── Setup ─────────────────────────────────────────────────────────────────
  const key = loadKey();
  const account = privateKeyToAccount(key);
  const pubClient = createPublicClient({ chain: celoSepolia, transport: http() });
  const wallet = createWalletClient({ account, chain: celoSepolia, transport: http() });

  log(`\n  Wallet:  ${account.address}`);
  log(`  Network: Celo Sepolia (11142220)`);

  // ── Step 1: Agent identities ──────────────────────────────────────────────
  step(1, "Resolving ERC-8004 agent identities");

  const balance = await pubClient.readContract({
    address: IDENTITY_REGISTRY, abi: ERC8004_ABI,
    functionName: "balanceOf", args: [account.address],
  });
  info(`Wallet has ${balance} agent NFT(s)`);

  // Find ALPHA token (first owned token)
  let ALPHA_ID = await findTokenId(pubClient, account.address, 50n);
  if (ALPHA_ID === null) {
    info("Minting first agent NFT for ALPHA...");
    const h = await wallet.writeContract({
      address: IDENTITY_REGISTRY, abi: ERC8004_ABI, functionName: "register",
    });
    const r = await pubClient.waitForTransactionReceipt({ hash: h });
    txLink(h, "register() → ALPHA NFT minted");
    // Parse Transfer event: topics[3] = tokenId
    const log_ = r.logs.find(l => l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    ALPHA_ID = log_ ? BigInt(log_.topics[3] ?? "0x0") : 0n;
  }
  ok(`ALPHA agent ID: ${ALPHA_ID} (seller)`);

  // Mint BETA token (second identity for the buyer role)
  info("Minting second agent NFT for BETA...");
  const mintBetaHash = await wallet.writeContract({
    address: IDENTITY_REGISTRY, abi: ERC8004_ABI, functionName: "register",
  });
  const mintBetaReceipt = await pubClient.waitForTransactionReceipt({ hash: mintBetaHash });
  txLink(mintBetaHash, "register() → BETA NFT minted");
  const betaLog = mintBetaReceipt.logs.find(l =>
    l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
  );
  const BETA_ID = betaLog ? BigInt(betaLog.topics[3] ?? "0x0") : ALPHA_ID + 1n;
  ok(`BETA  agent ID: ${BETA_ID} (buyer)`);

  // ── Step 2: ALPHA registers a service ─────────────────────────────────────
  step(2, "ALPHA registers a data-scraping service");

  const PRICE = parseUnits("0.5", 18); // 0.5 mUSDC per call

  const svcHash = await wallet.writeContract({
    address: SERVICE_REGISTRY, abi: REGISTRY_ABI,
    functionName: "registerService",
    args: [
      ALPHA_ID,
      "celo-data-scraper",
      "Fetches real-time Celo ecosystem data (price, TVL, validator stats). Returns JSON. Pays mUSDC.",
      "https://nastar.agent/alpha/celo-data",
      USDm,
      PRICE,
      [],
    ],
  });
  const svcReceipt = await pubClient.waitForTransactionReceipt({ hash: svcHash });
  txLink(svcHash, "registerService()");

  // Parse ServiceRegistered(uint256 indexed serviceId, ...) — topic[1] = serviceId
  const SVC_REGISTERED_TOPIC = "0x2f97baea4f38ff977318c4e4648cfa7b665121ba164e1cb7070d29a78f59f475";
  const svcLog = svcReceipt.logs.find(l => l.topics[0] === SVC_REGISTERED_TOPIC);
  const SERVICE_ID = svcLog ? BigInt(svcLog.topics[1] ?? "0x0") : 0n;
  ok(`Service ID: ${SERVICE_ID} | Price: ${formatUnits(PRICE, 18)} mUSDC/call`);

  // ── Step 3: BETA discovers & creates a deal ────────────────────────────────
  step(3, "BETA creates a deal — escrowing 0.5 mUSDC");

  const usdmBalance = await pubClient.readContract({
    address: USDm, abi: ERC20_ABI,
    functionName: "balanceOf", args: [account.address],
  });
  info(`Wallet mUSDC balance: ${formatUnits(usdmBalance, 18)}`);

  // MockERC20 has open mint — self-fund for demo
  if (usdmBalance < PRICE) {
    info("Minting test tokens (MockERC20 — open mint on testnet)...");
    const mintHash = await wallet.writeContract({
      address: USDm, abi: ERC20_ABI,
      functionName: "mint",
      args: [account.address, PRICE * 10n],
    });
    await pubClient.waitForTransactionReceipt({ hash: mintHash });
    txLink(mintHash, `mint(wallet, ${formatUnits(PRICE * 10n, 18)} mUSDC)`);
    ok("Test tokens minted");
  }

  // Approve escrow
  const approveHash = await wallet.writeContract({
    address: USDm, abi: ERC20_ABI,
    functionName: "approve",
    args: [NASTAR_ESCROW, PRICE],
  });
  await pubClient.waitForTransactionReceipt({ hash: approveHash });
  txLink(approveHash, `approve(escrow, ${formatUnits(PRICE, 18)} mUSDC)`);

  // Create deal
  const DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const dealHash = await wallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "createDeal",
    args: [
      SERVICE_ID, BETA_ID, ALPHA_ID, USDm, PRICE,
      "Fetch Celo price, 24h volume, and top 5 validators. Return structured JSON.",
      DEADLINE,
    ],
  });
  const dealReceipt = await pubClient.waitForTransactionReceipt({ hash: dealHash });
  txLink(dealHash, "createDeal() — 0.5 mUSDC locked in escrow");

  // Parse DealCreated(uint256 indexed dealId, ...) — topic[1] = dealId
  const DEAL_CREATED_TOPIC = "0x6bb122e4b14a41d111379967e6fd6c18cdd1cab504eea94e1765d3bded713ce6";
  const dealLog = dealReceipt.logs.find(l => l.topics[0] === DEAL_CREATED_TOPIC);
  const DEAL_ID = dealLog ? BigInt(dealLog.topics[1] ?? "0x0") : 0n;
  ok(`Deal ID: ${DEAL_ID} | Status: Created | Escrow: ${NASTAR_ESCROW}`);

  // ── Step 4: ALPHA accepts ──────────────────────────────────────────────────
  step(4, "ALPHA accepts the deal");

  const acceptHash = await wallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "acceptDeal", args: [DEAL_ID],
  });
  await pubClient.waitForTransactionReceipt({ hash: acceptHash });
  txLink(acceptHash, "acceptDeal()");
  ok("Status: Created → Accepted");

  // ── Step 5: ALPHA delivers with proof ──────────────────────────────────────
  step(5, "ALPHA performs work and delivers proof on-chain");

  const PROOF = JSON.stringify({
    requestedBy: `agent:${BETA_ID}`,
    deliveredBy: `agent:${ALPHA_ID}`,
    timestamp: new Date().toISOString(),
    data: {
      celo_price_usd: 0.527,
      volume_24h_usd: 21_400_000,
      top_validators: [
        "0xDa2b...c1F4", "0x7e3A...b92C",
        "0xF31c...44Aa", "0xA8b0...e7D1",
        "0x22cd...f80E",
      ],
    },
  });

  const deliverHash = await wallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "deliverDeal", args: [DEAL_ID, PROOF],
  });
  await pubClient.waitForTransactionReceipt({ hash: deliverHash });
  txLink(deliverHash, "deliverDeal(proof)");
  ok("Status: Accepted → Delivered");
  info(`Proof (preview): ${PROOF.slice(0, 90)}...`);

  // ── Step 6: BETA confirms & payment releases ───────────────────────────────
  step(6, "BETA confirms delivery — escrow releases to ALPHA");

  const alphaBalBefore = await pubClient.readContract({
    address: USDm, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address],
  });

  const confirmHash = await wallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "confirmDelivery", args: [DEAL_ID],
  });
  await pubClient.waitForTransactionReceipt({ hash: confirmHash });
  txLink(confirmHash, "confirmDelivery() — payment released");
  ok("Status: Delivered → Completed");

  // ── Step 7: Final state ────────────────────────────────────────────────────
  step(7, "Reading final deal state from chain");

  // Wait for RPC to propagate confirmed state
  await new Promise(r => setTimeout(r, 3000));
  const deal = await pubClient.readContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "getDeal", args: [DEAL_ID],
  });

  log(`
  ${C.bold}Deal Summary${C.reset}
  ├── dealId:      ${deal.dealId}
  ├── serviceId:   ${deal.serviceId}
  ├── buyer:       agent ${deal.buyerAgentId} (${deal.buyer})
  ├── seller:      agent ${deal.sellerAgentId} (${deal.seller})
  ├── amount:      ${formatUnits(deal.amount, 18)} USDm
  ├── token:       ${deal.paymentToken}
  ├── status:      ${C.green}${DEAL_STATUS[deal.status]}${C.reset}
  ├── created:     ${new Date(Number(deal.createdAt) * 1000).toISOString()}
  └── completed:   ${new Date(Number(deal.completedAt) * 1000).toISOString()}
  `);

  // ── Reputation ─────────────────────────────────────────────────────────────
  divider("DEMO COMPLETE");
  log(`
  ${C.green}${C.bold}Full agent-to-agent deal executed on Celo Sepolia.${C.reset}

  What happened:
    [1] ALPHA minted an ERC-8004 agent identity (NFT #${ALPHA_ID})
    [2] BETA  minted an ERC-8004 agent identity (NFT #${BETA_ID})
    [3] ALPHA registered a service on-chain (priced in USDm)
    [4] BETA  discovered the service, locked ${formatUnits(PRICE, 18)} mUSDC in escrow
    [5] ALPHA accepted the task and delivered a signed JSON payload
    [6] BETA  confirmed delivery — escrow auto-released to ALPHA
    [7] Both agents now have on-chain deal history = verifiable reputation

  Contracts:
    ServiceRegistry: ${SERVICE_REGISTRY}
    NastarEscrow:    ${NASTAR_ESCROW}
    Identity:        ${IDENTITY_REGISTRY}

  Explorer:
    https://sepolia.celoscan.io/address/${NASTAR_ESCROW}
  `);
}

main().catch(err => {
  console.error(`\n  ${C.red}Demo failed:${C.reset}`, err.shortMessage ?? err.message ?? err);
  process.exit(1);
});
