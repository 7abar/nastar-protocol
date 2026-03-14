import { defineChain } from "viem";

// ── Celo Alfajores (Nastar testnet) ──────────────────────────────────────────
export const celoAlfajores = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  network: "celo-sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
    public: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
  blockExplorers: {
    default: { name: "Celo Sepolia Explorer", url: "https://sepolia.celoscan.io" },
  },
  testnet: true,
});

// ── Contract addresses ────────────────────────────────────────────────────────
export const CONTRACTS = {
  SERVICE_REGISTRY: "0x035Cec0391bF6399249EEbD1272A82898a22dF73" as `0x${string}`,
  NASTAR_ESCROW: "0xE662494f34D6a2e3a299e4509e925A6fF5BeB532" as `0x${string}`,
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
} as const;

// ── Known stablecoins on Celo Alfajores ──────────────────────────────────────
export const TOKENS = {
  USDm: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" as `0x${string}`,
  USDT: "0xd077A400968890Eacc75cdc901F0356c943e4fDb" as `0x${string}`,
} as const;

// ── x402 payment config ───────────────────────────────────────────────────────
export const X402_CONFIG = {
  // Server wallet — receives micro-payments for premium endpoints
  payTo: (process.env.SERVER_WALLET ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  // Price per premium API call: 0.001 USDm (1000 units, 6 decimals)
  priceWei: BigInt(1000),
  token: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" as `0x${string}`,
  network: "celo-sepolia",
};

export const PORT = Number(process.env.PORT ?? 3000);
