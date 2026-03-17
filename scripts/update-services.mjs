/**
 * Update on-chain service names to match Supabase names
 * Run: source ../.env.wallet && node scripts/update-services.mjs
 */
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) { console.error("Set PRIVATE_KEY env var"); process.exit(1); }

const SERVICE_REGISTRY = "0xef37730c5efb3ab92143b61c83f8357076ce811d";
const PAYMENT_TOKEN = "0x765DE816845861e75A25fCA122bb6898B8B1282a"; // cUSD

const ABI = parseAbi([
  "function updateService(uint256 serviceId, string name, string description, string endpoint, address paymentToken, uint256 pricePerCall, bool active) external",
  "function getService(uint256 serviceId) external view returns ((uint256 agentId, address provider, string name, string description, string endpoint, address paymentToken, uint256 pricePerCall, bool active, uint256 createdAt, uint256 updatedAt, bytes32[] tags))",
]);

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({ chain: celo, transport: http() });
const walletClient = createWalletClient({ account, chain: celo, transport: http() });

const UPDATES = [
  { serviceId: 0, name: "CeloTrader", description: "DeFi trading agent — executes token swaps with slippage protection, price alerts, and DCA strategies", price: "50000000000000000" }, // 0.05 cUSD
  { serviceId: 1, name: "PayFlow", description: "Payment automation — sends stablecoins, processes invoices, manages recurring transfers", price: "500000000000000000" }, // 0.5 cUSD
  { serviceId: 2, name: "CeloScope", description: "Research agent — analyzes wallets, governance proposals, and market trends", price: "50000000000000000" },
  { serviceId: 3, name: "RemitCelo", description: "Cross-border remittance — converts and sends money globally via Mento stablecoins", price: "1000000000000000000" },
  { serviceId: 4, name: "HedgeBot", description: "FX hedging agent — manages multi-currency exposure with Mento stablecoins", price: "1000000000000000000" },
  { serviceId: 5, name: "Anya", description: "AI content agent — writes threads, content calendars, community reports", price: "2000000000000000000" },
  { serviceId: 6, name: "DAOkeeper", description: "DAO operations — manages treasury, tracks proposals, processes payroll", price: "2000000000000000000" },
  { serviceId: 7, name: "YieldMax", description: "DeFi yield optimizer — scans protocols for best yields, auto-harvests", price: "1000000000000000000" },
];

const ENDPOINT = "https://api.nastar.fun/api/agent/endpoint";

for (const u of UPDATES) {
  try {
    // Read current service to check provider
    const svc = await publicClient.readContract({
      address: SERVICE_REGISTRY,
      abi: ABI,
      functionName: "getService",
      args: [BigInt(u.serviceId)],
    });

    console.log(`#${u.serviceId} current: "${svc.name}" by ${svc.provider}`);

    if (svc.provider.toLowerCase() !== account.address.toLowerCase()) {
      console.log(`  SKIP — provider mismatch (${svc.provider} != ${account.address})`);
      continue;
    }

    const hash = await walletClient.writeContract({
      address: SERVICE_REGISTRY,
      abi: ABI,
      functionName: "updateService",
      args: [
        BigInt(u.serviceId),
        u.name,
        u.description,
        ENDPOINT,
        PAYMENT_TOKEN,
        BigInt(u.price),
        true,
      ],
    });

    console.log(`  UPDATED → "${u.name}" TX: ${hash}`);
    
    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  CONFIRMED`);
  } catch (err) {
    console.log(`  ERROR: ${err.message?.slice(0, 100)}`);
  }
}

console.log("\nDone!");
