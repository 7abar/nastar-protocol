"use client";

import { formatUnits } from "viem";
import Link from "next/link";
import { DEAL_STATUS, DEAL_STATUS_COLOR } from "@/lib/contracts";

interface Deal {
  dealId: bigint;
  serviceId: bigint;
  buyerAgentId: bigint;
  sellerAgentId: bigint;
  buyer: string;
  seller: string;
  paymentToken: string;
  amount: bigint;
  taskDescription: string;
  deliveryProof: string;
  status: number;
  createdAt: bigint;
  deadline: bigint;
  completedAt: bigint;
  disputedAt: bigint;
}

export function DealCard({
  deal,
  onConfirm,
  onDispute,
  onRefund,
}: {
  deal: Deal;
  onConfirm?: () => void;
  onDispute?: () => void;
  onRefund?: () => void;
}) {
  const status = DEAL_STATUS[deal.status] || "Unknown";
  const statusColor = DEAL_STATUS_COLOR[deal.status] || "bg-gray-500/20 text-gray-400";

  return (
    <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-sm text-white/40">Deal #{deal.dealId.toString()}</span>
          <h3 className="font-semibold text-white mt-0.5 line-clamp-1">
            {deal.taskDescription}
          </h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColor}`}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div>
          <span className="text-white/40">Amount</span>
          <p className="text-white font-medium">{formatUnits(deal.amount, 6)} USDC</p>
        </div>
        <div>
          <span className="text-white/40">Seller Agent</span>
          <p className="text-white font-medium">#{deal.sellerAgentId.toString()}</p>
        </div>
        <div>
          <span className="text-white/40">Created</span>
          <p className="text-white/70">
            {new Date(Number(deal.createdAt) * 1000).toLocaleDateString()}
          </p>
        </div>
        <div>
          <span className="text-white/40">Deadline</span>
          <p className="text-white/70">
            {new Date(Number(deal.deadline) * 1000).toLocaleDateString()}
          </p>
        </div>
      </div>

      {deal.deliveryProof && (
        <div className="mb-4 p-3 rounded-lg bg-white/5 text-xs text-white/60 font-mono overflow-hidden">
          <span className="text-white/30">Delivery proof: </span>
          {deal.deliveryProof.slice(0, 100)}...
        </div>
      )}

      <div className="flex gap-2">
        {deal.status === 2 && onConfirm && (
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-green-500 text-black hover:bg-green-400 transition"
          >
            Confirm Delivery
          </button>
        )}
        {deal.status === 2 && onDispute && (
          <button
            onClick={onDispute}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
          >
            Dispute
          </button>
        )}
        {(deal.status === 0 || deal.status === 1) &&
          Number(deal.deadline) < Date.now() / 1000 &&
          onRefund && (
            <button
              onClick={onRefund}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition"
            >
              Claim Refund
            </button>
          )}
        {deal.status === 4 && (
          <Link
            href={`/disputes/${deal.dealId.toString()}`}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-[#F4C430]/20 text-[#F4C430] hover:bg-[#F4C430]/30 transition text-center"
          >
            AI Judge
          </Link>
        )}
      </div>
    </div>
  );
}
