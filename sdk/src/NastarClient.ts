/**
 * NastarClient — TypeScript SDK for the Nastar Agent Marketplace
 *
 * Usage:
 *   import { NastarClient } from "nastar-sdk";
 *
 *   // Read-only
 *   const client = new NastarClient();
 *   const services = await client.listServices();
 *
 *   // With signing (write ops)
 *   const client = new NastarClient({ privateKey: "0x..." });
 *   const hash = await client.registerService({ ... });
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  toBytes,
  toHex,
  pad,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  celoSepolia,
  DEFAULT_CONTRACTS,
  DEAL_STATUS,
  SERVICE_REGISTRY_ABI,
  NASTAR_ESCROW_ABI,
  ERC20_ABI,
} from "./constants.js";
import type {
  NastarConfig,
  Service,
  Deal,
  AgentProfile,
  RegisterServiceParams,
  CreateDealParams,
  TxHash,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function bigStr(v: bigint): string { return v.toString(); }

function serializeService(raw: {
  agentId: bigint; provider: string; name: string; description: string;
  endpoint: string; paymentToken: string; pricePerCall: bigint;
  active: boolean; createdAt: bigint; updatedAt: bigint;
}): Service {
  return {
    agentId: bigStr(raw.agentId), provider: raw.provider,
    name: raw.name, description: raw.description,
    endpoint: raw.endpoint, paymentToken: raw.paymentToken,
    pricePerCall: bigStr(raw.pricePerCall), active: raw.active,
    createdAt: bigStr(raw.createdAt), updatedAt: bigStr(raw.updatedAt),
  };
}

function serializeDeal(raw: {
  dealId: bigint; serviceId: bigint; buyerAgentId: bigint; sellerAgentId: bigint;
  buyer: string; seller: string; paymentToken: string; amount: bigint;
  taskDescription: string; deliveryProof: string; status: number;
  createdAt: bigint; deadline: bigint; completedAt: bigint;
}): Deal {
  return {
    dealId: bigStr(raw.dealId), serviceId: bigStr(raw.serviceId),
    buyerAgentId: bigStr(raw.buyerAgentId), sellerAgentId: bigStr(raw.sellerAgentId),
    buyer: raw.buyer, seller: raw.seller, paymentToken: raw.paymentToken,
    amount: bigStr(raw.amount), taskDescription: raw.taskDescription,
    deliveryProof: raw.deliveryProof, status: raw.status,
    statusLabel: DEAL_STATUS[raw.status] ?? "Unknown",
    createdAt: bigStr(raw.createdAt), deadline: bigStr(raw.deadline),
    completedAt: bigStr(raw.completedAt),
  };
}

function tagToBytes32(tag: string): `0x${string}` {
  return pad(toHex(toBytes(tag)), { size: 32 });
}

// ── NastarClient ──────────────────────────────────────────────────────────────

export class NastarClient {
  readonly contracts: typeof DEFAULT_CONTRACTS;

  private pub: ReturnType<typeof createPublicClient>;
  private wal: ReturnType<typeof createWalletClient> | null = null;
  private acct: ReturnType<typeof privateKeyToAccount> | null = null;

  constructor(config: NastarConfig = {}) {
    this.contracts = {
      SERVICE_REGISTRY: config.contracts?.serviceRegistry ?? DEFAULT_CONTRACTS.SERVICE_REGISTRY,
      NASTAR_ESCROW:    config.contracts?.nastarEscrow    ?? DEFAULT_CONTRACTS.NASTAR_ESCROW,
      IDENTITY_REGISTRY: config.contracts?.identityRegistry ?? DEFAULT_CONTRACTS.IDENTITY_REGISTRY,
    };

    const transport = http(config.rpcUrl ?? celoSepolia.rpcUrls.default.http[0]);
    this.pub = createPublicClient({ chain: celoSepolia, transport });

    if (config.privateKey) {
      this.acct = privateKeyToAccount(config.privateKey);
      this.wal  = createWalletClient({ account: this.acct, chain: celoSepolia, transport });
    }
  }

  /** Connected wallet address (null if read-only) */
  get address(): `0x${string}` | null { return this.acct?.address ?? null; }

  // ── Read: Services ──────────────────────────────────────────────────────────

  async getService(serviceId: bigint): Promise<Service> {
    const raw = await this.pub.readContract({
      address: this.contracts.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getService",
      args: [serviceId],
    });
    return serializeService(raw);
  }

  async listServices(offset = 0n, limit = 20n): Promise<{ services: Service[]; total: string }> {
    const [raw, total] = await this.pub.readContract({
      address: this.contracts.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getActiveServices",
      args: [offset, limit],
    });
    return { services: raw.map(serializeService), total: bigStr(total) };
  }

  async getAgentServices(agentId: bigint): Promise<Service[]> {
    const ids = await this.pub.readContract({
      address: this.contracts.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "getAgentServices",
      args: [agentId],
    });
    return Promise.all(ids.map(id => this.getService(id)));
  }

  async getServicesByTag(tag: string): Promise<Service[]> {
    const tagBytes = tagToBytes32(tag);
    const ids = await this.pub.readContract({
      address: this.contracts.SERVICE_REGISTRY,
      abi: [
        { type: "function", name: "getServicesByTag",
          inputs: [{ name: "tag", type: "bytes32" }],
          outputs: [{ type: "uint256[]" }], stateMutability: "view" },
      ] as const,
      functionName: "getServicesByTag",
      args: [tagBytes],
    });
    return Promise.all(ids.map(id => this.getService(id)));
  }

  async serviceCount(): Promise<bigint> {
    return this.pub.readContract({
      address: this.contracts.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "nextServiceId",
    });
  }

  // ── Read: Deals ─────────────────────────────────────────────────────────────

  async getDeal(dealId: bigint): Promise<Deal> {
    const raw = await this.pub.readContract({
      address: this.contracts.NASTAR_ESCROW,
      abi: NASTAR_ESCROW_ABI,
      functionName: "getDeal",
      args: [dealId],
    });
    return serializeDeal(raw);
  }

  async dealCount(): Promise<bigint> {
    return this.pub.readContract({
      address: this.contracts.NASTAR_ESCROW,
      abi: NASTAR_ESCROW_ABI,
      functionName: "nextDealId",
    });
  }

  /**
   * Fetch all deals for an agent plus computed reputation score.
   */
  async getAgentProfile(agentId: bigint): Promise<AgentProfile> {
    const [buyerIds, sellerIds] = await Promise.all([
      this.pub.readContract({
        address: this.contracts.NASTAR_ESCROW,
        abi: NASTAR_ESCROW_ABI,
        functionName: "getBuyerDeals",
        args: [agentId],
      }),
      this.pub.readContract({
        address: this.contracts.NASTAR_ESCROW,
        abi: NASTAR_ESCROW_ABI,
        functionName: "getSellerDeals",
        args: [agentId],
      }),
    ]);

    const [asBuyer, asSeller] = await Promise.all([
      Promise.all(buyerIds.map(id => this.getDeal(id))),
      Promise.all(sellerIds.map(id => this.getDeal(id))),
    ]);

    const all = [...asBuyer, ...asSeller];
    const completed = all.filter(d => d.statusLabel === "Completed").length;
    const disputed  = all.filter(d => d.statusLabel === "Disputed").length;

    return {
      agentId: bigStr(agentId),
      asBuyer,
      asSeller,
      stats: {
        totalDeals: all.length,
        completedDeals: completed,
        disputedDeals: disputed,
        reputationScore: all.length > 0
          ? `${Math.round((completed / all.length) * 100)}%`
          : "0%",
      },
    };
  }

  // ── Read: Token balance ─────────────────────────────────────────────────────

  async tokenBalance(token: `0x${string}`, address?: `0x${string}`): Promise<bigint> {
    const target = address ?? this.acct?.address;
    if (!target) throw new Error("Provide address or init with privateKey");
    return this.pub.readContract({
      address: token, abi: ERC20_ABI,
      functionName: "balanceOf", args: [target],
    });
  }

  // ── Write: Services ─────────────────────────────────────────────────────────

  /**
   * Register a new service listing on-chain.
   * Caller must own the ERC-8004 agent NFT for `agentId`.
   */
  async registerService(params: RegisterServiceParams): Promise<TxHash> {
    this._requireWallet();
    const tags = (params.tags ?? []).map(tagToBytes32);
    const hash = await this.wal!.writeContract({
      address: this.contracts.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "registerService",
      args: [
        params.agentId, params.name, params.description,
        params.endpoint, params.paymentToken, params.pricePerCall, tags,
      ],
      account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  async deactivateService(serviceId: bigint): Promise<TxHash> {
    this._requireWallet();
    const hash = await this.wal!.writeContract({
      address: this.contracts.SERVICE_REGISTRY,
      abi: SERVICE_REGISTRY_ABI,
      functionName: "deactivateService",
      args: [serviceId],
      account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ── Write: Deals ─────────────────────────────────────────────────────────────

  /**
   * Create a deal and escrow payment in one call.
   * Automatically approves token spend before creating.
   */
  async createDeal(params: CreateDealParams): Promise<{ dealId: bigint; txHash: TxHash }> {
    this._requireWallet();

    const deadline = BigInt(Math.floor(Date.now() / 1000) + params.deadlineSeconds);

    // Approve
    const approveTx = await this.wal!.writeContract({
      address: params.paymentToken, abi: ERC20_ABI,
      functionName: "approve",
      args: [this.contracts.NASTAR_ESCROW, params.amount],
      account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash: approveTx });

    // Create deal
    const hash = await this.wal!.writeContract({
      address: this.contracts.NASTAR_ESCROW,
      abi: NASTAR_ESCROW_ABI,
      functionName: "createDeal",
      args: [
        params.serviceId, params.buyerAgentId, params.sellerAgentId,
        params.paymentToken, params.amount, params.taskDescription, deadline,
      ],
      account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });

    // dealId = nextDealId - 1
    const nextId = await this.dealCount();
    return { dealId: nextId - 1n, txHash: hash };
  }

  async acceptDeal(dealId: bigint): Promise<TxHash> {
    this._requireWallet();
    const hash = await this.wal!.writeContract({
      address: this.contracts.NASTAR_ESCROW, abi: NASTAR_ESCROW_ABI,
      functionName: "acceptDeal", args: [dealId], account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  async deliverDeal(dealId: bigint, proof: string): Promise<TxHash> {
    this._requireWallet();
    const hash = await this.wal!.writeContract({
      address: this.contracts.NASTAR_ESCROW, abi: NASTAR_ESCROW_ABI,
      functionName: "deliverDeal", args: [dealId, proof], account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  async confirmDelivery(dealId: bigint): Promise<TxHash> {
    this._requireWallet();
    const hash = await this.wal!.writeContract({
      address: this.contracts.NASTAR_ESCROW, abi: NASTAR_ESCROW_ABI,
      functionName: "confirmDelivery", args: [dealId], account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  async disputeDeal(dealId: bigint): Promise<TxHash> {
    this._requireWallet();
    const hash = await this.wal!.writeContract({
      address: this.contracts.NASTAR_ESCROW, abi: NASTAR_ESCROW_ABI,
      functionName: "disputeDeal", args: [dealId], account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  async claimRefund(dealId: bigint): Promise<TxHash> {
    this._requireWallet();
    const hash = await this.wal!.writeContract({
      address: this.contracts.NASTAR_ESCROW, abi: NASTAR_ESCROW_ABI,
      functionName: "claimRefund", args: [dealId], account: this.acct!,
    });
    await this.pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  private _requireWallet(): void {
    if (!this.wal || !this.acct) {
      throw new Error("Write operations require a private key. Pass privateKey to NastarClient.");
    }
  }
}
