/**
 * Nastar End-to-End Demo
 * ======================
 * Two separate wallets, two ERC-8004 agents, real on-chain deal.
 *
 *   SELLER wallet → Agent ALPHA — registers service, delivers work
 *   BUYER  wallet → Agent BETA  — discovers service, pays, confirms
 *
 * Every step is a real on-chain transaction on Celo Sepolia.
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
  keccak256,
  toBytes,
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
const SERVICE_REGISTRY  = "0x035Cec0391bF6399249EEbD1272A82898a22dF73" as const;
const NASTAR_ESCROW     = "0xE662494f34D6a2e3a299e4509e925A6fF5BeB532" as const;
const MOCK_USDC         = "0x93C86be298bcF530E183954766f103B061BF64Ef" as const;
const TOKEN_DECIMALS    = 6;

// ── ABIs ──────────────────────────────────────────────────────────────────────
const ERC8004_ABI = [
  { type: "function", name: "register",
    inputs: [], outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable" },
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
        { name: "disputedAt", type: "uint256" },
      ],
    }], stateMutability: "view" },
] as const;

const DEAL_STATUS = ["Created","Accepted","Delivered","Completed","Disputed","Refunded","Expired","Resolved"];

// ── Logger ────────────────────────────────────────────────────────────────────
const C = { reset:"\x1b[0m", bold:"\x1b[1m", green:"\x1b[32m", cyan:"\x1b[36m", yellow:"\x1b[33m", dim:"\x1b[2m", red:"\x1b[31m" };
const step = (n: number, m: string) => console.log(`\n${C.bold}${C.cyan}[Step ${n}]${C.reset} ${m}`);
const ok   = (m: string) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const info = (m: string) => console.log(`  ${C.dim}→ ${m}${C.reset}`);
const txLink = (h: Hash, label: string) => {
  console.log(`  ${C.yellow}TX${C.reset} ${label}`);
  console.log(`     https://sepolia.celoscan.io/tx/${h}`);
};

// Event topic hashes
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SVC_REGISTERED_TOPIC = "0x2f97baea4f38ff977318c4e4648cfa7b665121ba164e1cb7070d29a78f59f475";
const DEAL_CREATED_TOPIC = "0x6bb122e4b14a41d111379967e6fd6c18cdd1cab504eea94e1765d3bded713ce6";

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadKey(): `0x${string}` {
  const raw = fs.readFileSync("/home/smart_user/.openclaw/workspace/.env.wallet", "utf8");
  const m = raw.match(/PRIVATE_KEY=(\S+)/);
  if (!m) throw new Error("PRIVATE_KEY not found");
  return m[1] as `0x${string}`;
}

function deriveKey(seed: `0x${string}`): `0x${string}` {
  return keccak256(toBytes(seed + "nastar-demo-buyer")) as `0x${string}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${"═".repeat(62)}\n  NASTAR — Agent Commerce Demo on Celo Sepolia\n${"═".repeat(62)}${C.reset}`);

  const sellerKey = loadKey();
  const buyerKey = deriveKey(sellerKey);
  const sellerAccount = privateKeyToAccount(sellerKey);
  const buyerAccount = privateKeyToAccount(buyerKey);

  const pub = createPublicClient({ chain: celoSepolia, transport: http() });
  const sellerWallet = createWalletClient({ account: sellerAccount, chain: celoSepolia, transport: http() });
  const buyerWallet = createWalletClient({ account: buyerAccount, chain: celoSepolia, transport: http() });

  console.log(`\n  Seller wallet: ${sellerAccount.address}`);
  console.log(`  Buyer wallet:  ${buyerAccount.address}`);

  const PRICE = parseUnits("5", TOKEN_DECIMALS); // 5 USDC

  // ── Step 1: Fund buyer wallet ─────────────────────────────────────────────
  step(1, "Funding buyer wallet with CELO + mock USDC");

  const buyerCelo = await pub.getBalance({ address: buyerAccount.address });
  if (buyerCelo < parseUnits("0.1", 18)) {
    const h = await sellerWallet.sendTransaction({
      to: buyerAccount.address,
      value: parseUnits("0.5", 18),
    });
    await pub.waitForTransactionReceipt({ hash: h });
    txLink(h, "Send 0.5 CELO to buyer");
  } else {
    ok("Buyer already has CELO");
  }

  // Mint mock USDC to buyer
  const mintH = await sellerWallet.writeContract({
    address: MOCK_USDC, abi: ERC20_ABI,
    functionName: "mint",
    args: [buyerAccount.address, parseUnits("100", TOKEN_DECIMALS)],
  });
  await pub.waitForTransactionReceipt({ hash: mintH });
  txLink(mintH, "Mint 100 USDC to buyer");

  // ── Step 2: Mint agent identities ─────────────────────────────────────────
  step(2, "Minting ERC-8004 agent identities");

  // Seller mints ALPHA
  const alphaH = await sellerWallet.writeContract({
    address: IDENTITY_REGISTRY, abi: ERC8004_ABI, functionName: "register",
  });
  const alphaR = await pub.waitForTransactionReceipt({ hash: alphaH });
  const alphaLog = alphaR.logs.find(l => l.topics[0] === TRANSFER_TOPIC);
  const ALPHA_ID = alphaLog ? BigInt(alphaLog.topics[3] ?? "0x0") : 0n;
  txLink(alphaH, `register() → ALPHA agent #${ALPHA_ID}`);

  // Buyer mints BETA
  const betaH = await buyerWallet.writeContract({
    address: IDENTITY_REGISTRY, abi: ERC8004_ABI, functionName: "register",
  });
  const betaR = await pub.waitForTransactionReceipt({ hash: betaH });
  const betaLog = betaR.logs.find(l => l.topics[0] === TRANSFER_TOPIC);
  const BETA_ID = betaLog ? BigInt(betaLog.topics[3] ?? "0x0") : 0n;
  txLink(betaH, `register() → BETA agent #${BETA_ID}`);

  ok(`ALPHA (seller): agent #${ALPHA_ID} owned by ${sellerAccount.address}`);
  ok(`BETA  (buyer):  agent #${BETA_ID} owned by ${buyerAccount.address}`);

  // ── Step 3: ALPHA registers service ───────────────────────────────────────
  step(3, "ALPHA registers a data service");

  const svcH = await sellerWallet.writeContract({
    address: SERVICE_REGISTRY, abi: REGISTRY_ABI,
    functionName: "registerService",
    args: [
      ALPHA_ID,
      "celo-data-scraper",
      "Fetches real-time Celo ecosystem data. Returns JSON.",
      "https://nastar.agent/alpha/celo-data",
      MOCK_USDC,
      PRICE,
      [],
    ],
  });
  const svcR = await pub.waitForTransactionReceipt({ hash: svcH });
  const svcLog = svcR.logs.find(l => l.topics[0] === SVC_REGISTERED_TOPIC);
  const SERVICE_ID = svcLog ? BigInt(svcLog.topics[1] ?? "0x0") : 0n;
  txLink(svcH, `registerService() → ID ${SERVICE_ID}`);
  ok(`Service: celo-data-scraper | Price: ${formatUnits(PRICE, TOKEN_DECIMALS)} USDC`);

  // ── Step 4: BETA creates deal ─────────────────────────────────────────────
  step(4, "BETA creates deal — locking 5 USDC in escrow");

  // Approve escrow
  const appH = await buyerWallet.writeContract({
    address: MOCK_USDC, abi: ERC20_ABI,
    functionName: "approve", args: [NASTAR_ESCROW, PRICE],
  });
  await pub.waitForTransactionReceipt({ hash: appH });

  const DEADLINE = BigInt(Math.floor(Date.now() / 1000) + 7200); // +2 hours

  const dealH = await buyerWallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "createDeal",
    args: [
      SERVICE_ID, BETA_ID, ALPHA_ID, MOCK_USDC, PRICE,
      "Fetch Celo price, 24h volume, and top 5 validators. Return JSON.",
      DEADLINE,
    ],
  });
  const dealR = await pub.waitForTransactionReceipt({ hash: dealH });
  const dealLog = dealR.logs.find(l => l.topics[0] === DEAL_CREATED_TOPIC);
  const DEAL_ID = dealLog ? BigInt(dealLog.topics[1] ?? "0x0") : 0n;
  txLink(dealH, `createDeal() → Deal #${DEAL_ID}`);
  ok(`5 USDC locked in escrow contract`);

  // ── Step 5: ALPHA accepts ─────────────────────────────────────────────────
  step(5, "ALPHA accepts the deal");

  const accH = await sellerWallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "acceptDeal", args: [DEAL_ID],
  });
  await pub.waitForTransactionReceipt({ hash: accH });
  txLink(accH, "acceptDeal()");
  ok("Status: Created → Accepted");

  // ── Step 6: ALPHA delivers ────────────────────────────────────────────────
  step(6, "ALPHA delivers proof on-chain");

  const PROOF = JSON.stringify({
    deliveredBy: `agent:${ALPHA_ID}`,
    timestamp: new Date().toISOString(),
    data: {
      celo_price_usd: 0.527,
      volume_24h_usd: 21_400_000,
      top_validators: ["0xDa2b...c1F4","0x7e3A...b92C","0xF31c...44Aa","0xA8b0...e7D1","0x22cd...f80E"],
    },
  });

  const delH = await sellerWallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "deliverDeal", args: [DEAL_ID, PROOF],
  });
  await pub.waitForTransactionReceipt({ hash: delH });
  txLink(delH, "deliverDeal(proof)");
  ok("Status: Accepted → Delivered");

  // ── Step 7: BETA confirms → payment released ─────────────────────────────
  step(7, "BETA confirms delivery — escrow releases payment to ALPHA");

  const confH = await buyerWallet.writeContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "confirmDelivery", args: [DEAL_ID],
  });
  await pub.waitForTransactionReceipt({ hash: confH });
  txLink(confH, "confirmDelivery()");
  ok("Status: Delivered → Completed");

  // ── Final: read state ─────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 3000));
  const deal = await pub.readContract({
    address: NASTAR_ESCROW, abi: ESCROW_ABI,
    functionName: "getDeal", args: [DEAL_ID],
  });

  const sellerBal = await pub.readContract({
    address: MOCK_USDC, abi: ERC20_ABI,
    functionName: "balanceOf", args: [sellerAccount.address],
  });

  const fee = (PRICE * 250n) / 10000n;
  const sellerPay = PRICE - fee;

  console.log(`
${C.bold}═══════════════════════════════════════════════════════════════
  DEAL COMPLETE
═══════════════════════════════════════════════════════════════${C.reset}
  Deal #${deal.dealId} | Status: ${C.green}${DEAL_STATUS[deal.status]}${C.reset}
  
  Buyer:   agent #${deal.buyerAgentId} (${deal.buyer})
  Seller:  agent #${deal.sellerAgentId} (${deal.seller})
  Amount:  ${formatUnits(deal.amount, TOKEN_DECIMALS)} USDC
  Fee:     ${formatUnits(fee, TOKEN_DECIMALS)} USDC (2.5% → protocol treasury)
  Seller:  ${formatUnits(sellerPay, TOKEN_DECIMALS)} USDC received
  
  Two wallets. Two agents. Real escrow. Real payment.
  No middleman. No trust required.
  
  ${C.dim}Contracts:
    ServiceRegistry: ${SERVICE_REGISTRY}
    NastarEscrow:    ${NASTAR_ESCROW}
    Identity:        ${IDENTITY_REGISTRY}${C.reset}
  `);
}

main().catch(err => {
  console.error(`\n  ${C.red}Demo failed:${C.reset}`, err.shortMessage ?? err.message ?? err);
  process.exit(1);
});
