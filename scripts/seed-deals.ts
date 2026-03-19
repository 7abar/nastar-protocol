/**
 * Seed real on-chain deals using existing cUSD balance.
 * Server = seller. New wallet = buyer.
 * Uses tiny amounts (0.003 cUSD) to stretch the 0.036 balance.
 */
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits, getAddress } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { celo } from "viem/chains";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env.wallet" });
dotenv.config({ path: "../../.env.wallet" });

const RPC = "https://forno.celo.org";
const USDm = getAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a");
const ESCROW = getAddress("0x132ab4b07849a5cee5104c2be32b32f9240b97ff");
const IDENTITY = getAddress("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");

const ERC20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
]);
const ID_ABI = parseAbi([
  "function register() returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
]);
const ESCROW_ABI = parseAbi([
  "function createDeal(uint256,uint256,uint256,address,uint256,string,uint256,bool) returns (uint256)",
  "function acceptDeal(uint256)",
  "function deliverDeal(uint256,string)",
  "function nextDealId() view returns (uint256)",
]);

const pk = process.env.PRIVATE_KEY!;
const serverAccount = privateKeyToAccount(pk as `0x${string}`);
const pub = createPublicClient({ chain: celo, transport: http(RPC) });
const serverWallet = createWalletClient({ account: serverAccount, chain: celo, transport: http(RPC) });

async function wait(h: `0x${string}`) {
  return pub.waitForTransactionReceipt({ hash: h });
}

async function mintId(w: any): Promise<bigint> {
  const h = await w.writeContract({ address: IDENTITY, abi: ID_ABI, functionName: "register" });
  const r = await wait(h);
  const log = r.logs.find((l: any) => l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  return log?.topics[3] ? BigInt(log.topics[3]) : 0n;
}

async function main() {
  console.log("=== Seeding On-Chain Deals (Celo Mainnet) ===\n");

  // Use existing buyer wallet that has cUSD from previous run
  const buyerPk = "0xc87c8662e6598cfd1b84e476e5ff92b3915b560154c89e7eb50e1fb51474f74d";
  const buyerAcct = privateKeyToAccount(buyerPk as `0x${string}`);
  const buyerWallet = createWalletClient({ account: buyerAcct, chain: celo, transport: http(RPC) });
  console.log(`Server (seller): ${serverAccount.address}`);
  console.log(`Buyer: ${buyerAcct.address}\n`);

  // Fund buyer with CELO for gas
  console.log("1. Funding buyer...");
  let h = await serverWallet.sendTransaction({ to: buyerAcct.address, value: parseUnits("2", 18) });
  await wait(h);

  // Transfer cUSD to buyer
  const serverBal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [serverAccount.address] });
  console.log(`   Server cUSD: ${formatUnits(serverBal, 18)}`);
  
  if (serverBal > 1000n) {
    h = await serverWallet.writeContract({ address: USDm, abi: ERC20, functionName: "transfer", args: [buyerAcct.address, serverBal] });
    await wait(h);
  }

  const buyerBal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
  console.log(`   Buyer cUSD: ${formatUnits(buyerBal, 18)}`);

  // Mint buyer identity
  console.log("\n2. Minting buyer identity...");
  const buyerTokenId = await mintId(buyerWallet);
  console.log(`   Buyer token: #${buyerTokenId}`);

  // Find server's token IDs (seller agents)
  console.log("\n3. Checking seller agents...");
  const agentIds = [1876, 1860, 1870, 1880, 1885, 1890, 1895];
  const validAgents: number[] = [];
  
  for (const aid of agentIds) {
    try {
      const owner = await pub.readContract({ address: IDENTITY, abi: ID_ABI, functionName: "ownerOf", args: [BigInt(aid)] });
      if ((owner as string).toLowerCase() === serverAccount.address.toLowerCase()) {
        validAgents.push(aid);
        console.log(`   Agent #${aid}: owned by server ✓`);
      } else {
        console.log(`   Agent #${aid}: owned by ${(owner as string).slice(0, 10)}... (not server)`);
      }
    } catch { console.log(`   Agent #${aid}: not found`); }
  }

  if (validAgents.length === 0) {
    console.error("\nNo agents owned by server! Cannot create deals.");
    process.exit(1);
  }

  // Approve escrow to spend buyer's cUSD
  console.log("\n4. Approving escrow...");
  h = await buyerWallet.writeContract({ address: USDm, abi: ERC20, functionName: "approve", args: [ESCROW, buyerBal] });
  await wait(h);

  // Re-check buyer balance after transfer
  const currentBal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
  console.log(`   Buyer actual cUSD: ${formatUnits(currentBal, 18)}`);
  
  // Use ~0.003 cUSD per deal
  const dealAmount = parseUnits("0.003", 18);
  const maxDeals = Number(currentBal / dealAmount);
  console.log(`\n5. Can create ${maxDeals} deals at 0.003 cUSD each`);

  const tasks = [
    { agent: 1876, svc: 0, task: "CELO/USD 24h trading signal — RSI + support/resistance analysis", proof: "CELO bullish. RSI 42, support $0.48, resistance $0.55. Accumulate below $0.50. Target $0.58." },
    { agent: 1860, svc: 2, task: "On-chain analysis of wallet 0xA584 — 7 day activity summary", proof: "47 txs in 7d. Primary: NFT minting + Ubeswap DeFi. Net flow: +12 CELO." },
    { agent: 1870, svc: 1, task: "Process 3 community bounty payments — 5 cUSD each", proof: "3 transfers totaling 15 cUSD executed. All confirmed on-chain." },
    { agent: 1880, svc: 3, task: "Convert 50 cUSD → KESm remittance to Nairobi merchant", proof: "50 cUSD → 6,450 KESm at rate 129.0. Delivered to 0x789...abc." },
    { agent: 1876, svc: 5, task: "Write 8-tweet thread about Nastar Protocol launch on Celo", proof: "Thread delivered: 8 tweets covering protocol, escrow, marketplace. Ready to publish." },
    { agent: 1890, svc: 6, task: "Weekly DAO treasury report — spending breakdown + recommendations", proof: "Treasury: $2.1M total, $340K spent. Grants 60%, Ops 25%, Dev 15%." },
    { agent: 1876, svc: 0, task: "Execute DCA: buy 10 CELO weekly for portfolio rebalancing", proof: "DCA executed: 10 CELO at $0.51 via Mento. Portfolio rebalanced." },
    { agent: 1860, svc: 2, task: "Mento governance proposal #42 — impact assessment report", proof: "Proposal: Add XOF stablecoin. Impact: West Africa expansion. Recommendation: Vote YES." },
    { agent: 1885, svc: 4, task: "Set up EUR/USD hedge with EURm and cUSD on Mento", proof: "Hedge position opened: 100 EURm against 108 cUSD. Delta-neutral." },
    { agent: 1895, svc: 7, task: "Optimize yield across Celo DeFi — Ubeswap, Moola, Curve", proof: "Optimized: moved 60% to Ubeswap CELO/cUSD LP (18% APY), 40% Moola lending (8% APY)." },
  ];

  console.log(`\n6. Creating deals...\n`);
  let created = 0;

  for (let i = 0; i < Math.min(tasks.length, maxDeals); i++) {
    const t = tasks[i];
    if (!validAgents.includes(t.agent)) {
      console.log(`   Skip: agent #${t.agent} not owned by server`);
      continue;
    }

    try {
      const bal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
      if (bal < dealAmount) { console.log("   Out of funds"); break; }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);

      // Buyer creates deal
      h = await buyerWallet.writeContract({
        address: ESCROW, abi: ESCROW_ABI, functionName: "createDeal",
        args: [BigInt(t.svc), buyerTokenId, BigInt(t.agent), USDm, dealAmount, t.task, deadline, true],
      });
      await wait(h);

      const nextId = await pub.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "nextDealId" });
      const dealId = Number(nextId) - 1;

      // Seller accepts
      h = await serverWallet.writeContract({
        address: ESCROW, abi: ESCROW_ABI, functionName: "acceptDeal", args: [BigInt(dealId)],
      });
      await wait(h);

      // Seller delivers (autoConfirm=true → auto-completes)
      h = await serverWallet.writeContract({
        address: ESCROW, abi: ESCROW_ABI, functionName: "deliverDeal", args: [BigInt(dealId), t.proof],
      });
      await wait(h);

      created++;
      console.log(`   ✓ Deal #${dealId}: ${t.task.slice(0, 55)}...`);
    } catch (e: any) {
      console.error(`   ✗ Failed: ${e.message?.slice(0, 150)}`);
    }
  }

  console.log(`\n=== Done! ${created} on-chain deals seeded ===`);
  const finalBal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
  console.log(`Buyer remaining: ${formatUnits(finalBal, 18)} cUSD`);
}

main().catch(console.error);
