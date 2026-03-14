/**
 * Seller Agent — Auto-Executes Tasks
 * ====================================
 * Enhanced seller runtime that accepts deals and delivers
 * simulated but realistic outputs for each service type.
 *
 * Runs alongside the Butler agent during the demo.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const celoSepolia = {
  id: 11142220,
  name: "Celo Sepolia",
  network: "celo-sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
    public: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
  testnet: true,
} as const;

const CONTRACTS = {
  NASTAR_ESCROW: "0xEE51f3CA1bcDeb58a94093F759BafBC9157734AF" as `0x${string}`,
  SERVICE_REGISTRY: "0x1aB9810d5E135f02fC66E875a77Da8fA4e49758e" as `0x${string}`,
};

const ESCROW_ABI = [
  {
    type: "function", name: "acceptDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "deliverDeal",
    inputs: [
      { name: "dealId", type: "uint256" },
      { name: "proof", type: "string" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "dealId", type: "uint256" },
        { name: "serviceId", type: "uint256" },
        { name: "buyerAgentId", type: "uint256" },
        { name: "sellerAgentId", type: "uint256" },
        { name: "buyer", type: "address" },
        { name: "seller", type: "address" },
        { name: "paymentToken", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "taskDescription", type: "string" },
        { name: "deliveryProof", type: "string" },
        { name: "status", type: "uint8" },
        { name: "createdAt", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "completedAt", type: "uint256" },
        { name: "disputedAt", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

// ── Service Handlers ──────────────────────────────────────────────────────────

const SERVICE_HANDLERS: Record<number, (task: string) => string> = {
  // Service 0: CeloDataFeed
  0: (task) => JSON.stringify({
    service: "CeloDataFeed",
    timestamp: new Date().toISOString(),
    data: {
      celoPrice: "$0.52",
      totalValidators: 110,
      activeValidators: 108,
      blockHeight: 20229100,
      avgBlockTime: "5.0s",
      totalStaked: "228M CELO",
      epochRewards: "0.12 CELO/block",
      topValidators: [
        { name: "cLabs", uptime: "99.98%", stake: "32M CELO" },
        { name: "Figment", uptime: "99.95%", stake: "18M CELO" },
        { name: "Chorus One", uptime: "99.92%", stake: "15M CELO" },
      ],
    },
  }, null, 2),

  // Service 1: SmartAuditor
  1: (task) => JSON.stringify({
    service: "SmartAuditor",
    timestamp: new Date().toISOString(),
    audit: {
      severity: "LOW",
      findings: [
        { id: "SA-001", severity: "INFO", title: "Floating pragma", description: "Use fixed Solidity version for production", line: 1 },
        { id: "SA-002", severity: "LOW", title: "Missing events", description: "State changes should emit events for off-chain tracking", line: 45 },
      ],
      summary: "No critical or high-severity issues found. Contract follows best practices for access control and reentrancy protection.",
      gasOptimization: "Consider using unchecked blocks for safe arithmetic to save ~200 gas per operation.",
      score: "92/100",
    },
  }, null, 2),

  // Service 2: NFTMinter
  2: (task) => JSON.stringify({
    service: "NFTMinter",
    timestamp: new Date().toISOString(),
    result: {
      status: "minted",
      tokenId: 42,
      collection: "Nastar Demo Collection",
      metadata: { name: "Demo NFT #42", image: "ipfs://QmDemo...", attributes: [{ trait_type: "Type", value: "Demo" }] },
      txHash: "0xdemo...simulated",
    },
  }, null, 2),

  // Service 3: TweetComposer
  3: (task) => JSON.stringify({
    service: "TweetComposer",
    timestamp: new Date().toISOString(),
    tweets: [
      "1/ Celo validator stats are looking strong. 108/110 validators active with 99.9%+ uptime across top operators.",
      "2/ Total staked: 228M CELO. That's serious security. cLabs leads with 32M, followed by Figment (18M) and Chorus One (15M).",
      "3/ Block time holding steady at 5.0s. Epoch rewards at 0.12 CELO/block. The network is humming.",
      "4/ Why this matters for agents: sub-cent gas means AI agents can transact thousands of times without burning through budgets.",
      "5/ Built on @CeloOrg. Verified on Nastar. This is what trustless AI commerce looks like.",
    ],
    hashtags: ["#Celo", "#AI", "#Web3", "#Agents"],
    estimatedEngagement: "medium-high",
  }, null, 2),

  // Service 4: SwapRouter
  4: (task) => JSON.stringify({
    service: "SwapRouter",
    timestamp: new Date().toISOString(),
    route: {
      input: "1000 cUSD",
      output: "1923.08 CELO",
      rate: "1 cUSD = 1.923 CELO",
      dex: "Ubeswap",
      priceImpact: "0.12%",
      gasCost: "0.001 CELO",
      path: ["cUSD", "CELO"],
      alternativeRoutes: [
        { dex: "Mento", output: "1920.50 CELO", priceImpact: "0.15%" },
      ],
    },
  }, null, 2),

  // Service 5: DocTranslator
  5: (task) => JSON.stringify({
    service: "DocTranslator",
    timestamp: new Date().toISOString(),
    translation: {
      sourceLanguage: "en",
      targetLanguage: "id",
      original: "Trustless AI agent marketplace with on-chain escrow and verifiable identity.",
      translated: "Marketplace agen AI tanpa kepercayaan dengan escrow on-chain dan identitas yang dapat diverifikasi.",
      confidence: 0.95,
      wordCount: { original: 11, translated: 14 },
    },
  }, null, 2),

  // Service 6: ChainAnalyzer
  6: (task) => JSON.stringify({
    service: "ChainAnalyzer",
    timestamp: new Date().toISOString(),
    analysis: {
      chain: "Celo",
      period: "24h",
      transactions: 145230,
      uniqueAddresses: 18420,
      gasUsed: "12.5B",
      avgGasPrice: "0.5 gwei",
      topContracts: [
        { name: "Mento Exchange", calls: 12450 },
        { name: "Ubeswap Router", calls: 8920 },
        { name: "Nastar Escrow", calls: 42 },
      ],
      trend: "Steady growth. Transaction volume up 8% vs yesterday.",
    },
  }, null, 2),

  // Service 7: WebScraper
  7: (task) => JSON.stringify({
    service: "WebScraper",
    timestamp: new Date().toISOString(),
    scrape: {
      url: "https://docs.celo.org",
      pagesScraped: 12,
      dataPoints: 48,
      summary: "Celo documentation covers L2 migration, validator setup, smart contract deployment, and SDK integration. Key updates include ERC-8004 support and MiniPay developer guidelines.",
      extractedLinks: 156,
      format: "structured_json",
    },
  }, null, 2),
};

// Fallback handler
function defaultHandler(task: string): string {
  return JSON.stringify({
    service: "GenericAgent",
    timestamp: new Date().toISOString(),
    result: `Task processed: ${task.slice(0, 100)}`,
    status: "completed",
  }, null, 2);
}

// ── Seller Agent ──────────────────────────────────────────────────────────────

export class SellerAgent {
  private pubClient: ReturnType<typeof createPublicClient>;
  private walletClient: ReturnType<typeof createWalletClient>;
  private account: ReturnType<typeof privateKeyToAccount>;
  private sellerAgentId: bigint;
  private running = false;
  private lastBlock = 0n;

  constructor(opts: { privateKey: `0x${string}`; sellerAgentId: bigint }) {
    this.account = privateKeyToAccount(opts.privateKey);
    this.sellerAgentId = opts.sellerAgentId;
    // @ts-ignore
    this.pubClient = createPublicClient({ chain: celoSepolia, transport: http() });
    // @ts-ignore
    this.walletClient = createWalletClient({ account: this.account, chain: celoSepolia, transport: http() });

    console.log(`[seller] Agent #${this.sellerAgentId} — ${this.account.address}`);
  }

  async start() {
    this.running = true;
    this.lastBlock = (await this.pubClient.getBlockNumber()) - 50n;
    console.log(`[seller] Watching from block ${this.lastBlock}`);

    while (this.running) {
      try {
        await this.poll();
      } catch (err) {
        console.error(`[seller] Poll error: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 8_000));
    }
  }

  stop() {
    this.running = false;
  }

  private async poll() {
    const current = await this.pubClient.getBlockNumber();
    if (current <= this.lastBlock) return;

    const logs = await this.pubClient.getLogs({
      address: CONTRACTS.NASTAR_ESCROW,
      event: parseAbiItem(
        "event DealCreated(uint256 indexed dealId, uint256 indexed buyerAgentId, uint256 indexed sellerAgentId, uint256 serviceId, address paymentToken, uint256 amount, uint256 deadline)"
      ),
      args: { sellerAgentId: this.sellerAgentId },
      fromBlock: this.lastBlock + 1n,
      toBlock: current,
    });

    for (const log of logs) {
      const dealId = log.args.dealId!;
      const serviceId = Number(log.args.serviceId ?? 0n);
      console.log(`\n[seller] New deal #${dealId} for service #${serviceId}`);

      try {
        // Read deal details
        const deal = await this.pubClient.readContract({
          address: CONTRACTS.NASTAR_ESCROW,
          abi: ESCROW_ABI,
          functionName: "getDeal",
          args: [dealId],
        });

        if (deal.status !== 0) {
          console.log(`[seller] Deal #${dealId} already processed (status ${deal.status})`);
          continue;
        }

        // If autoConfirm=true, deal may already be auto-completed on delivery
        // Still accept + deliver to show the full loop
        console.log(`[seller] Accepting deal #${dealId}...`);
        const acceptHash = await this.walletClient.writeContract({
          address: CONTRACTS.NASTAR_ESCROW,
          abi: ESCROW_ABI,
          functionName: "acceptDeal",
          args: [dealId],
          account: this.account,
        });
        await this.pubClient.waitForTransactionReceipt({ hash: acceptHash });
        console.log(`[seller] Accepted: ${acceptHash}`);

        // Execute handler
        const handler = SERVICE_HANDLERS[serviceId] ?? defaultHandler;
        const output = handler(deal.taskDescription);
        console.log(`[seller] Generated output (${output.length} chars)`);

        // Small delay to simulate work
        await new Promise((r) => setTimeout(r, 2_000));

        // Deliver
        console.log(`[seller] Delivering deal #${dealId}...`);
        const deliverHash = await this.walletClient.writeContract({
          address: CONTRACTS.NASTAR_ESCROW,
          abi: ESCROW_ABI,
          functionName: "deliverDeal",
          args: [dealId, output],
          account: this.account,
        });
        await this.pubClient.waitForTransactionReceipt({ hash: deliverHash });
        console.log(`[seller] Delivered: ${deliverHash}`);
        console.log(`[seller] Deal #${dealId} complete!`);

      } catch (err) {
        console.error(`[seller] Error on deal #${dealId}: ${(err as Error).message}`);
      }
    }

    this.lastBlock = current;
  }
}
