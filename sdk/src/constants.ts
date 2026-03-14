import { defineChain } from "viem";

export const celoSepolia = defineChain({
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

export const DEFAULT_CONTRACTS = {
  SERVICE_REGISTRY: "0x035Cec0391bF6399249EEbD1272A82898a22dF73" as `0x${string}`,
  NASTAR_ESCROW: "0xE662494f34D6a2e3a299e4509e925A6fF5BeB532" as `0x${string}`,
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
} as const;

export const KNOWN_TOKENS = {
  USDm: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" as `0x${string}`,
  USDT: "0xd077A400968890Eacc75cdc901F0356c943e4fDb" as `0x${string}`,
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

export const SERVICE_REGISTRY_ABI = [
  {
    type: "function", name: "registerService",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "paymentToken", type: "address" },
      { name: "pricePerCall", type: "uint256" },
      { name: "tags", type: "bytes32[]" },
    ],
    outputs: [{ name: "serviceId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "updateService",
    inputs: [
      { name: "serviceId", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "paymentToken", type: "address" },
      { name: "pricePerCall", type: "uint256" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "deactivateService",
    inputs: [{ name: "serviceId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getService",
    inputs: [{ name: "serviceId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "agentId", type: "uint256" },
        { name: "provider", type: "address" },
        { name: "name", type: "string" },
        { name: "description", type: "string" },
        { name: "endpoint", type: "string" },
        { name: "paymentToken", type: "address" },
        { name: "pricePerCall", type: "uint256" },
        { name: "active", type: "bool" },
        { name: "createdAt", type: "uint256" },
        { name: "updatedAt", type: "uint256" },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getActiveServices",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "result", type: "tuple[]",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "provider", type: "address" },
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "endpoint", type: "string" },
          { name: "paymentToken", type: "address" },
          { name: "pricePerCall", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "createdAt", type: "uint256" },
          { name: "updatedAt", type: "uint256" },
        ],
      },
      { name: "count", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "getAgentServices",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "nextServiceId",
    inputs: [], outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const NASTAR_ESCROW_ABI = [
  {
    type: "function", name: "createDeal",
    inputs: [
      { name: "serviceId", type: "uint256" },
      { name: "buyerAgentId", type: "uint256" },
      { name: "sellerAgentId", type: "uint256" },
      { name: "paymentToken", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "taskDescription", type: "string" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "dealId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
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
    type: "function", name: "confirmDelivery",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "disputeDeal",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "claimRefund",
    inputs: [{ name: "dealId", type: "uint256" }],
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
  {
    type: "function", name: "contestDispute",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "sellerClaimAfterTimeout",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "sellerClaimFromAbandonedDispute",
    inputs: [{ name: "dealId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getBuyerDeals",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getSellerDeals",
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
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "decimals",
    inputs: [], outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
] as const;
