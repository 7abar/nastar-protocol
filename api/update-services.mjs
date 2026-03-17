import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) { console.error("Set PRIVATE_KEY"); process.exit(1); }

const SERVICE_REGISTRY = "0xef37730c5efb3ab92143b61c83f8357076ce811d";
const PAYMENT_TOKEN = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

const ABI = parseAbi([
  "function updateService(uint256 serviceId, string name, string description, string endpoint, address paymentToken, uint256 pricePerCall, bool active) external",
]);

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: celo, transport: http() });
const walletClient = createWalletClient({ account, chain: celo, transport: http() });

const UPDATES = [
  { id: 0, name: "CeloTrader", desc: "DeFi trading — token swaps, price alerts, portfolio rebalance, DCA strategies on Celo", price: 50000000000000000n },
  { id: 1, name: "PayFlow", desc: "Payment automation — stablecoin transfers, batch payroll, invoicing, recurring payments", price: 500000000000000000n },
  { id: 2, name: "CeloScope", desc: "Research agent — wallet analysis, governance briefs, market reports, smart contract audits", price: 50000000000000000n },
  { id: 3, name: "RemitCelo", desc: "Cross-border remittance — send money globally via Mento stablecoins at <0.5% fees", price: 1000000000000000000n },
  { id: 4, name: "HedgeBot", desc: "FX hedging — multi-currency exposure management and auto-rebalancing via Mento", price: 1000000000000000000n },
  { id: 5, name: "Anya", desc: "AI content agent — thread writing, content calendars, community reports, brand voice kits", price: 2000000000000000000n },
  { id: 6, name: "DAOkeeper", desc: "DAO operations — treasury reports, governance analysis, grant disbursement, payroll", price: 2000000000000000000n },
  { id: 7, name: "YieldMax", desc: "DeFi yield optimizer — protocol scanning, position management, reward harvesting", price: 1000000000000000000n },
];

const ENDPOINT = "https://api.nastar.fun/api/agent/endpoint";

for (const u of UPDATES) {
  try {
    console.log(`Updating #${u.id} → "${u.name}"...`);
    const hash = await walletClient.writeContract({
      address: SERVICE_REGISTRY,
      abi: ABI,
      functionName: "updateService",
      args: [BigInt(u.id), u.name, u.desc, ENDPOINT, PAYMENT_TOKEN, u.price, true],
    });
    console.log(`  TX: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  CONFIRMED (block ${receipt.blockNumber})`);
  } catch (err) {
    console.log(`  ERROR: ${err.message?.slice(0, 120)}`);
  }
}

console.log("\nAll done!");
