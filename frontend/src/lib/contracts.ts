import { defineChain } from "viem";

// Celo Mainnet
export const celo = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo.org"] },
  },
  blockExplorers: {
    default: { name: "CeloScan", url: "https://celoscan.io" },
  },
  testnet: false,
});

// Backward compat alias
export const celoSepoliaCustom = celo;

export const CONTRACTS = {
  SERVICE_REGISTRY: "0xef37730c5efb3ab92143b61c83f8357076ce811d" as `0x${string}`,
  NASTAR_ESCROW: "0x132ab4b07849a5cee5104c2be32b32f9240b97ff" as `0x${string}`,
  IDENTITY_REGISTRY: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as `0x${string}`,
  SELF_VERIFIER: "0x2a6C8C57290D0e2477EE0D0Eb2f352511EC97bb8" as `0x${string}`,
} as const;

// ── Mento Stablecoins — Celo Mainnet ─────────────────────────────────────────
// Source: https://docs.celo.org/build-on-celo/build-with-local-stablecoin
export const CELO_TOKENS = {
  USDm:  "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`,
  EURm:  "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73" as `0x${string}`,
  BRLm:  "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787" as `0x${string}`,
  COPm: "0x8a567e2ae79ca692bd748ab832081c45de4041ea" as `0x${string}`,
  XOFm: "0x73F93dcc49cB8A239e2032663e9475dd5ef29A08" as `0x${string}`,
  KESm:  "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0" as `0x${string}`,
  PHPm:  "0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B" as `0x${string}`,
  GBPm:  "0xCCF663b1fF11028f0b19058d0f7B674004a40746" as `0x${string}`,
  NGNm:  "0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71" as `0x${string}`,
  GHSm:  "0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313" as `0x${string}`,
  ZARm:  "0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6" as `0x${string}`,
  CADm:  "0xff4Ab19391af240c311c54200a492233052B6325" as `0x${string}`,
  AUDm:  "0x7175504C455076F15c04A2F90a8e352281F492F9" as `0x${string}`,
  JPYm:  "0xc45eCF20f3CD864B32D9794d6f76814aE8892e20" as `0x${string}`,
  CHFm:  "0xb55a79F398E759E43C95b979163f30eC87Ee131D" as `0x${string}`,
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`,
} as const;

export interface TokenMeta {
  symbol: string;
  name: string;
  flag: string;
  address: `0x${string}`;
  decimals: number;
}

export const TOKEN_LIST: TokenMeta[] = [
  // USD-pegged
  { symbol: "USDm", name: "Mento Dollar",              flag: "🇺🇸", address: CELO_TOKENS.USDm, decimals: 18 },
  { symbol: "USDC", name: "USD Coin",                  flag: "💵", address: CELO_TOKENS.USDC, decimals: 6  },
  // Major currencies
  { symbol: "EURm", name: "Mento Euro",                flag: "🇪🇺", address: CELO_TOKENS.EURm, decimals: 18 },
  { symbol: "GBPm", name: "Mento British Pound",       flag: "🇬🇧", address: CELO_TOKENS.GBPm, decimals: 18 },
  { symbol: "CHFm", name: "Mento Swiss Franc",         flag: "🇨🇭", address: CELO_TOKENS.CHFm, decimals: 18 },
  { symbol: "CADm", name: "Mento Canadian Dollar",     flag: "🇨🇦", address: CELO_TOKENS.CADm, decimals: 18 },
  { symbol: "AUDm", name: "Mento Australian Dollar",   flag: "🇦🇺", address: CELO_TOKENS.AUDm, decimals: 18 },
  { symbol: "JPYm", name: "Mento Japanese Yen",        flag: "🇯🇵", address: CELO_TOKENS.JPYm, decimals: 18 },
  // Latin America
  { symbol: "BRLm", name: "Mento Brazilian Real",      flag: "🇧🇷", address: CELO_TOKENS.BRLm, decimals: 18 },
  { symbol: "COPm", name: "Mento Colombian Peso",      flag: "🇨🇴", address: CELO_TOKENS.COPm, decimals: 18 },
  // Africa
  { symbol: "KESm", name: "Mento Kenyan Shilling",     flag: "🇰🇪", address: CELO_TOKENS.KESm, decimals: 18 },
  { symbol: "NGNm", name: "Mento Nigerian Naira",      flag: "🇳🇬", address: CELO_TOKENS.NGNm, decimals: 18 },
  { symbol: "GHSm", name: "Mento Ghanaian Cedi",       flag: "🇬🇭", address: CELO_TOKENS.GHSm, decimals: 18 },
  { symbol: "ZARm", name: "Mento South African Rand",  flag: "🇿🇦", address: CELO_TOKENS.ZARm, decimals: 18 },
  { symbol: "XOFm", name: "Mento West African CFA",    flag: "🌍", address: CELO_TOKENS.XOFm, decimals: 18 },
  // Asia-Pacific
  { symbol: "PHPm", name: "Mento Philippine Peso",     flag: "🇵🇭", address: CELO_TOKENS.PHPm, decimals: 18 },
];

export function getTokenByAddress(address: string): TokenMeta | undefined {
  return TOKEN_LIST.find(t => t.address.toLowerCase() === address.toLowerCase());
}

export function formatTokenAmount(amount: bigint | string, token: TokenMeta): string {
  const raw = typeof amount === "string" ? BigInt(amount) : amount;
  const value = Number(raw) / 10 ** token.decimals;
  return `${token.flag} ${value.toFixed(2)} ${token.symbol}`;
}

export const DEAL_STATUS: Record<number, string> = {
  0: "Created",
  1: "Accepted",
  2: "Delivered",
  3: "Completed",
  4: "Disputed",
  5: "Refunded",
  6: "Expired",
  7: "Resolved",
};

export const DEAL_STATUS_COLOR: Record<number, string> = {
  0: "bg-blue-500/20 text-blue-400",
  1: "bg-yellow-500/20 text-yellow-400",
  2: "bg-purple-500/20 text-purple-400",
  3: "bg-green-500/20 text-green-400",
  4: "bg-red-500/20 text-red-400",
  5: "bg-orange-500/20 text-orange-400",
  6: "bg-gray-500/20 text-gray-400",
  7: "bg-teal-500/20 text-teal-400",
};

export const SERVICE_REGISTRY_ABI = [
  {
    type: "function", name: "registerService",
    inputs: [
      { name: "agentId", type: "uint256" }, { name: "name", type: "string" },
      { name: "description", type: "string" }, { name: "endpoint", type: "string" },
      { name: "paymentToken", type: "address" }, { name: "pricePerCall", type: "uint256" },
      { name: "tags", type: "string[]" },
    ],
    outputs: [{ name: "serviceId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getActiveServices",
    inputs: [{ name: "offset", type: "uint256" }, { name: "limit", type: "uint256" }],
    outputs: [
      {
        name: "result", type: "tuple[]",
        components: [
          { name: "agentId", type: "uint256" }, { name: "provider", type: "address" },
          { name: "name", type: "string" }, { name: "description", type: "string" },
          { name: "endpoint", type: "string" }, { name: "paymentToken", type: "address" },
          { name: "pricePerCall", type: "uint256" }, { name: "active", type: "bool" },
          { name: "createdAt", type: "uint256" }, { name: "updatedAt", type: "uint256" },
        ],
      },
      { name: "count", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "getService",
    inputs: [{ name: "serviceId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "agentId", type: "uint256" }, { name: "provider", type: "address" },
        { name: "name", type: "string" }, { name: "description", type: "string" },
        { name: "endpoint", type: "string" }, { name: "paymentToken", type: "address" },
        { name: "pricePerCall", type: "uint256" }, { name: "active", type: "bool" },
        { name: "createdAt", type: "uint256" }, { name: "updatedAt", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

export const ESCROW_ABI = [
  {
    type: "function", name: "createDeal",
    inputs: [
      { name: "serviceId", type: "uint256" }, { name: "buyerAgentId", type: "uint256" },
      { name: "sellerAgentId", type: "uint256" }, { name: "paymentToken", type: "address" },
      { name: "amount", type: "uint256" }, { name: "taskDescription", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "autoConfirm", type: "bool" },
    ],
    outputs: [{ name: "dealId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "confirmDelivery",
    inputs: [{ name: "dealId", type: "uint256" }], outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "disputeDeal",
    inputs: [{ name: "dealId", type: "uint256" }], outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "claimRefund",
    inputs: [{ name: "dealId", type: "uint256" }], outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getDeal",
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
    }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getBuyerDeals",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "nextDealId",
    inputs: [], outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event", name: "DisputeResolved",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "sellerBps", type: "uint256", indexed: false },
      { name: "buyerAmount", type: "uint256", indexed: false },
      { name: "sellerAmount", type: "uint256", indexed: false },
      { name: "feeAmount", type: "uint256", indexed: false },
      { name: "reasoning", type: "string", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function", name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
] as const;

export const ERC8004_ABI = [
  {
    type: "function", name: "register",
    inputs: [], outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "register",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "setAgentURI",
    inputs: [{ name: "tokenId", type: "uint256" }, { name: "uri", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "agentURI",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }], stateMutability: "view",
  },
] as const;

// ERC-8004 Reputation Registry (Celo Sepolia)
export const REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as `0x${string}`;
export const REPUTATION_ABI = [
  {
    type: "function", name: "giveFeedback",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "uint8" },
      { name: "tag", type: "string" },
      { name: "comment", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getSummary",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "totalFeedback", type: "uint256" },
      { name: "averageScore", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;
