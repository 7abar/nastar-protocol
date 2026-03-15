import { defineChain } from "viem";

// ── Celo Mainnet ─────────────────────────────────────────────────────────────
export const celoAlfajores = defineChain({
  id: 42220,
  name: "Celo",
  network: "celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo.org"] },
    public: { http: ["https://forno.celo.org"] },
  },
  blockExplorers: {
    default: { name: "CeloScan", url: "https://celoscan.io" },
  },
  testnet: false,
});

// ── Contract addresses (Celo Mainnet) ─────────────────────────────────────────
export const CONTRACTS = {
  SERVICE_REGISTRY: "0xef37730c5efb3ab92143b61c83f8357076ce811d" as `0x${string}`,
  NASTAR_ESCROW: "0x132ab4b07849a5cee5104c2be32b32f9240b97ff" as `0x${string}`,
  IDENTITY_REGISTRY: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as `0x${string}`,
  SELF_VERIFIER: "0x2a6C8C57290D0e2477EE0D0Eb2f352511EC97bb8" as `0x${string}`,
} as const;

// ── Mento Stablecoins — Celo Mainnet ─────────────────────────────────────────
// Source: https://docs.celo.org/build-on-celo/build-with-local-stablecoin
export const TOKENS = {
  // USD-pegged
  USDm:  "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`,
  USDC:  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`,
  // Major currencies
  EURm:  "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73" as `0x${string}`,
  GBPm:  "0xCCF663b1fF11028f0b19058d0f7B674004a40746" as `0x${string}`,
  CHFm:  "0xb55a79F398E759E43C95b979163f30eC87Ee131D" as `0x${string}`,
  CADm:  "0xff4Ab19391af240c311c54200a492233052B6325" as `0x${string}`,
  AUDm:  "0x7175504C455076F15c04A2F90a8e352281F492F9" as `0x${string}`,
  JPYm:  "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20" as `0x${string}`,
  // Latin America
  BRLm:  "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787" as `0x${string}`,
  COPm:  "0x8a567e2ae79ca692bd748ab832081c45de4041ea" as `0x${string}`,
  // Africa
  KESm:  "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0" as `0x${string}`,
  NGNm:  "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71" as `0x${string}`,
  GHSm:  "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313" as `0x${string}`,
  ZARm:  "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6" as `0x${string}`,
  XOFm:  "0x73F93dcc49cB8A239e2032663e9475dd5ef29A08" as `0x${string}`,
  // Asia-Pacific
  PHPm:  "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B" as `0x${string}`,
} as const;

// Alias
export const CELO_TOKENS = TOKENS;

// Human-readable token metadata
export const TOKEN_META: Record<string, { symbol: string; name: string; flag: string; decimals: number }> = {
  // USD-pegged
  [TOKENS.USDm.toLowerCase()]:  { symbol: "USDm",  name: "Mento Dollar",             flag: "🇺🇸", decimals: 18 },
  [TOKENS.USDC.toLowerCase()]:  { symbol: "USDC",  name: "USD Coin",                 flag: "💵", decimals: 6  },
  // Major currencies
  [TOKENS.EURm.toLowerCase()]:  { symbol: "EURm",  name: "Mento Euro",               flag: "🇪🇺", decimals: 18 },
  [TOKENS.GBPm.toLowerCase()]:  { symbol: "GBPm",  name: "Mento British Pound",      flag: "🇬🇧", decimals: 18 },
  [TOKENS.CHFm.toLowerCase()]:  { symbol: "CHFm",  name: "Mento Swiss Franc",        flag: "🇨🇭", decimals: 18 },
  [TOKENS.CADm.toLowerCase()]:  { symbol: "CADm",  name: "Mento Canadian Dollar",    flag: "🇨🇦", decimals: 18 },
  [TOKENS.AUDm.toLowerCase()]:  { symbol: "AUDm",  name: "Mento Australian Dollar",  flag: "🇦🇺", decimals: 18 },
  [TOKENS.JPYm.toLowerCase()]:  { symbol: "JPYm",  name: "Mento Japanese Yen",       flag: "🇯🇵", decimals: 18 },
  // Latin America
  [TOKENS.BRLm.toLowerCase()]:  { symbol: "BRLm",  name: "Mento Brazilian Real",     flag: "🇧🇷", decimals: 18 },
  [TOKENS.COPm.toLowerCase()]:  { symbol: "COPm",  name: "Mento Colombian Peso",     flag: "🇨🇴", decimals: 18 },
  // Africa
  [TOKENS.KESm.toLowerCase()]:  { symbol: "KESm",  name: "Mento Kenyan Shilling",    flag: "🇰🇪", decimals: 18 },
  [TOKENS.NGNm.toLowerCase()]:  { symbol: "NGNm",  name: "Mento Nigerian Naira",     flag: "🇳🇬", decimals: 18 },
  [TOKENS.GHSm.toLowerCase()]:  { symbol: "GHSm",  name: "Mento Ghanaian Cedi",      flag: "🇬🇭", decimals: 18 },
  [TOKENS.ZARm.toLowerCase()]:  { symbol: "ZARm",  name: "Mento South African Rand", flag: "🇿🇦", decimals: 18 },
  [TOKENS.XOFm.toLowerCase()]:  { symbol: "XOFm",  name: "Mento West African CFA",   flag: "🌍", decimals: 18 },
  // Asia-Pacific
  [TOKENS.PHPm.toLowerCase()]:  { symbol: "PHPm",  name: "Mento Philippine Peso",    flag: "🇵🇭", decimals: 18 },
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
  token: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`,
  network: "celo-sepolia",
};

export const PORT = Number(process.env.PORT ?? 3000);
