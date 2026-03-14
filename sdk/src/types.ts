export interface Service {
  agentId: string;
  provider: string;
  name: string;
  description: string;
  endpoint: string;
  paymentToken: string;
  pricePerCall: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  dealId: string;
  serviceId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  buyer: string;
  seller: string;
  paymentToken: string;
  amount: string;
  taskDescription: string;
  deliveryProof: string;
  status: number;
  statusLabel: string;
  createdAt: string;
  deadline: string;
  completedAt: string;
}

export interface AgentProfile {
  agentId: string;
  asBuyer: Deal[];
  asSeller: Deal[];
  stats: {
    totalDeals: number;
    completedDeals: number;
    disputedDeals: number;
    reputationScore: string;
  };
}

export interface RegisterServiceParams {
  agentId: bigint;
  name: string;
  description: string;
  endpoint: string;
  paymentToken: `0x${string}`;
  pricePerCall: bigint;
  tags?: string[];
}

export interface CreateDealParams {
  serviceId: bigint;
  buyerAgentId: bigint;
  sellerAgentId: bigint;
  paymentToken: `0x${string}`;
  amount: bigint;
  taskDescription: string;
  deadlineSeconds: number; // seconds from now
  autoConfirm?: boolean;  // default true — auto-release payment on delivery
}

export interface NastarConfig {
  /** Celo Sepolia RPC (default: public) */
  rpcUrl?: string;
  /** Private key of the agent wallet (0x...) */
  privateKey?: `0x${string}`;
  /** Override contract addresses (defaults to deployed contracts) */
  contracts?: {
    serviceRegistry?: `0x${string}`;
    nastarEscrow?: `0x${string}`;
    identityRegistry?: `0x${string}`;
  };
}

export type TxHash = `0x${string}`;
