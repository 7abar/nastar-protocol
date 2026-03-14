import { defineChain } from "viem";

export const celoSepolia = defineChain({
  id: 44787,
  name: "Celo Alfajores",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://alfajores-forno.celo-testnet.org"] },
  },
  blockExplorers: {
    default: { name: "Celo Explorer", url: "https://alfajores.celoscan.io" },
  },
  testnet: true,
});

// Use Celo Sepolia (chain 11142220) for our contracts
export const celoSepoliaCustom = defineChain({
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

export const CONTRACTS = {
  SERVICE_REGISTRY: "0x1aB9810d5E135f02fC66E875a77Da8fA4e49758e" as `0x${string}`,
  NASTAR_ESCROW: "0xEE51f3CA1bcDeb58a94093F759BafBC9157734AF" as `0x${string}`,
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
  MOCK_USDC: "0x93C86be298bcF530E183954766f103B061BF64Ef" as `0x${string}`,
} as const;

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
