import { defineChain } from "viem";

export const celoSepolia = defineChain({
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

export const celoMainnet = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo.org"] },
  },
  blockExplorers: {
    default: { name: "Celo Explorer", url: "https://celoscan.io" },
  },
});

// Deployed contracts (Celo Sepolia)
export const CONTRACTS_SEPOLIA = {
  SERVICE_REGISTRY: "0x035Cec0391bF6399249EEbD1272A82898a22dF73" as `0x${string}`,
  NASTAR_ESCROW:    "0xE662494f34D6a2e3a299e4509e925A6fF5BeB532" as `0x${string}`,
  IDENTITY_REGISTRY: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`,
};

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

export const ESCROW_ABI = [
  { type: "function", name: "getDeal",
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
    }], stateMutability: "view" },
  { type: "function", name: "acceptDeal",
    inputs: [{ name: "dealId", type: "uint256" }], outputs: [],
    stateMutability: "nonpayable" },
  { type: "function", name: "deliverDeal",
    inputs: [{ name: "dealId", type: "uint256" }, { name: "proof", type: "string" }],
    outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "nextDealId",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "event", name: "DealCreated",
    inputs: [
      { name: "dealId", type: "uint256", indexed: true },
      { name: "buyerAgentId", type: "uint256", indexed: true },
      { name: "sellerAgentId", type: "uint256", indexed: true },
      { name: "serviceId", type: "uint256", indexed: false },
      { name: "paymentToken", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ] },
] as const;
