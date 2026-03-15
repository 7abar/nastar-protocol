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
  SERVICE_REGISTRY: "0xF87bf96823517AC497808E563ED050fD736309f9" as `0x${string}`,
  NASTAR_ESCROW: "0xE0D52EAadBA61c56731875cD6a23D8E84763D32F" as `0x${string}`,
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
} as const;

// ── Mento Stablecoins — Celo Sepolia Testnet ─────────────────────────────────
// Source: https://docs.celo.org/tooling/contracts/token-contracts
export const TOKENS = {
  // Celo Sepolia testnet addresses
  USDm: "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80" as `0x${string}`,
  EURm: "0x6B172e333e2978484261D7eCC3DE491E79764BbC" as `0x${string}`,
  BRLm: "0x2294298942fdc79417DE9E0D740A4957E0e7783a" as `0x${string}`,
  COPm: "0x5F8d55c3627d2dc0a2B4afa798f877242F382F67" as `0x${string}`,
  XOFm: "0x5505b70207aE3B826c1A7607F19F3Bf73444A082" as `0x${string}`,
} as const;

// Alias
export const CELO_TOKENS = TOKENS;

// Human-readable token metadata
export const TOKEN_META: Record<string, { symbol: string; name: string; flag: string; decimals: number }> = {
  "0xef4d55d6de8e8d73232827cd1e9b2f2dbb45bc80": { symbol: "USDm", name: "Mento Dollar",           flag: "🇺🇸", decimals: 18 },
  "0x6b172e333e2978484261d7ecc3de491e79764bbc": { symbol: "EURm", name: "Mento Euro",              flag: "🇪🇺", decimals: 18 },
  "0x2294298942fdc79417de9e0d740a4957e0e7783a": { symbol: "BRLm", name: "Mento Brazilian Real",    flag: "🇧🇷", decimals: 18 },
  "0x5f8d55c3627d2dc0a2b4afa798f877242f382f67": { symbol: "COPm", name: "Mento Colombian Peso",    flag: "🇨🇴", decimals: 18 },
  "0x5505b70207ae3b826c1a7607f19f3bf73444a082": { symbol: "XOFm", name: "Mento West African CFA",  flag: "🌍", decimals: 18 },
};

export function getTokenMeta(address: string) {
  return TOKEN_META[address.toLowerCase()] ?? { symbol: "???", name: "Unknown Token", flag: "🪙", decimals: 18 };
}

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
