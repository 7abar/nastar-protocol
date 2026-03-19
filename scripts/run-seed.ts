import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env.wallet" });
dotenv.config({ path: "../../.env.wallet" });

const RPC = "https://forno.celo.org";
const CELO_TOKEN = getAddress("0x471EcE3750Da237f93B8E339c536989b8978a438");
const USDm = getAddress("0x765DE816845861e75A25fCA122bb6898B8B1282a");
const ESCROW = getAddress("0x132ab4b07849a5cee5104c2be32b32f9240b97ff");
const IDENTITY = getAddress("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
const ROUTER = getAddress("0xE3D8bd6Aed4F159bc8000a9cD47CffDb95F96121");

const ERC20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);
const ROUTER_ABI = parseAbi(["function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])"]);
const ID_ABI = parseAbi(["function register() returns (uint256)", "function balanceOf(address) view returns (uint256)", "function ownerOf(uint256) view returns (address)"]);
const ESCROW_ABI = parseAbi(["function createDeal(uint256,uint256,uint256,address,uint256,string,uint256,bool) returns (uint256)", "function acceptDeal(uint256)", "function deliverDeal(uint256,string)", "function nextDealId() view returns (uint256)"]);

const serverPk = process.env.PRIVATE_KEY!;
const buyerPk = "0xc87c8662e6598cfd1b84e476e5ff92b3915b560154c89e7eb50e1fb51474f74d";

const serverAcct = privateKeyToAccount(serverPk as `0x${string}`);
const buyerAcct = privateKeyToAccount(buyerPk as `0x${string}`);
const pub = createPublicClient({ chain: celo, transport: http(RPC) });
const serverW = createWalletClient({ account: serverAcct, chain: celo, transport: http(RPC) });
const buyerW = createWalletClient({ account: buyerAcct, chain: celo, transport: http(RPC) });

async function w(h: `0x${string}`) { return pub.waitForTransactionReceipt({ hash: h }); }

async function main() {
  console.log("=== Celo Mainnet Deal Seeder ===\n");
  console.log(`Server: ${serverAcct.address}`);
  console.log(`Buyer:  ${buyerAcct.address}\n`);

  // Step 1: Check cUSD balance, swap if needed
  let bal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
  if (bal < parseUnits("0.5", 18)) {
    console.log("1. Swapping 8 CELO → cUSD...");
    const swapAmt = parseUnits("8", 18);
    let h = await buyerW.writeContract({ address: CELO_TOKEN, abi: ERC20, functionName: "approve", args: [ROUTER, swapAmt] });
    await w(h);
    h = await buyerW.writeContract({
      address: ROUTER, abi: ROUTER_ABI, functionName: "swapExactTokensForTokens",
      args: [swapAmt, 0n, [CELO_TOKEN, USDm], buyerAcct.address, BigInt(Math.floor(Date.now()/1000) + 600)],
    });
    await w(h);
  } else {
    console.log("1. Already have cUSD, skipping swap");
  }
  bal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
  console.log(`   cUSD: ${formatUnits(bal, 18)}\n`);

  // Step 2: Mint buyer identity (or find existing)
  let buyerTokenId: bigint;
  const idBal = await pub.readContract({ address: IDENTITY, abi: ID_ABI, functionName: "balanceOf", args: [buyerAcct.address] });
  if (idBal > 0n) {
    // Find existing
    for (let i = 2600n; i <= 2650n; i++) {
      try {
        const o = await pub.readContract({ address: IDENTITY, abi: ID_ABI, functionName: "ownerOf", args: [i] });
        if ((o as string).toLowerCase() === buyerAcct.address.toLowerCase()) { buyerTokenId = i; break; }
      } catch {}
    }
    buyerTokenId = buyerTokenId! || 0n;
  } else {
    console.log("2. Minting buyer identity...");
    const mh = await buyerW.writeContract({ address: IDENTITY, abi: ID_ABI, functionName: "register" });
    const mr = await w(mh);
    const log = mr.logs.find((l: any) => l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    buyerTokenId = log?.topics[3] ? BigInt(log.topics[3]) : 0n;
  }
  console.log(`   Buyer token: #${buyerTokenId}\n`);

  // Step 3: Approve escrow (re-read balance after swap)
  const actualBal = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
  console.log(`   Actual cUSD: ${formatUnits(actualBal, 18)}`);
  h = await buyerW.writeContract({ address: USDm, abi: ERC20, functionName: "approve", args: [ESCROW, actualBal] });
  await w(h);

  // Step 4: Create + complete deals
  const deals = [
    { agent: 1876, svc: 0, task: "CELO/USD 24h trading signal with RSI analysis", proof: "CELO bullish. RSI 42, support $0.48, target $0.58." },
    { agent: 1860, svc: 2, task: "On-chain analysis: wallet 0xA584 7-day activity", proof: "47 txs. NFT minting + Ubeswap DeFi. Net: +12 CELO." },
    { agent: 1876, svc: 5, task: "Write 8-tweet thread about Nastar launch", proof: "8 tweets delivered. Protocol overview, escrow flow, marketplace." },
    { agent: 1860, svc: 2, task: "Mento governance proposal #42 impact report", proof: "XOF stablecoin addition. West Africa expansion. Vote: YES." },
    { agent: 1876, svc: 0, task: "DCA execution: buy 10 CELO for portfolio rebalance", proof: "10 CELO at $0.51 via Mento. Portfolio updated." },
    { agent: 1860, svc: 2, task: "Ubeswap protocol TVL and volume analysis", proof: "TVL $12M, 24h vol $890K. CELO/cUSD top pair at 42%." },
    { agent: 1876, svc: 0, task: "Set stop-loss alerts for CELO position at $0.42", proof: "Alerts configured. Will trigger SMS if CELO drops below $0.42." },
    { agent: 1860, svc: 2, task: "Weekly Celo ecosystem report — new protocols + TVL", proof: "3 new protocols. TVL up 8% to $210M. Top: Mento, Ubeswap, Moola." },
  ];

  const dealAmt = parseUnits("2", 18); // 2 cUSD per deal
  console.log(`3. Creating ${deals.length} deals at 2 cUSD each...\n`);

  let ok = 0;
  for (const d of deals) {
    try {
      const deadline = BigInt(Math.floor(Date.now()/1000) + 86400 * 30);
      h = await buyerW.writeContract({
        address: ESCROW, abi: ESCROW_ABI, functionName: "createDeal",
        args: [BigInt(d.svc), buyerTokenId, BigInt(d.agent), USDm, dealAmt, d.task, deadline, true],
      });
      await w(h);
      const nid = await pub.readContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "nextDealId" });
      const did = Number(nid) - 1;

      h = await serverW.writeContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "acceptDeal", args: [BigInt(did)] });
      await w(h);

      h = await serverW.writeContract({ address: ESCROW, abi: ESCROW_ABI, functionName: "deliverDeal", args: [BigInt(did), d.proof] });
      await w(h);

      ok++;
      console.log(`   ✓ #${did}: ${d.task.slice(0, 55)}...`);
    } catch (e: any) {
      console.error(`   ✗ ${e.message?.slice(0, 120)}`);
    }
  }

  console.log(`\n=== ${ok} deals on-chain! ===`);
  const f = await pub.readContract({ address: USDm, abi: ERC20, functionName: "balanceOf", args: [buyerAcct.address] });
  console.log(`Remaining: ${formatUnits(f, 18)} cUSD`);
}

main().catch(e => console.error(e.message?.slice(0, 300)));
