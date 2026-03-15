import { createPublicClient, http } from "viem";
import { celoAlfajores } from "../config.js";

export const publicClient = createPublicClient({
  chain: celoAlfajores,
  transport: http(),
});

// Deal status enum (mirrors Solidity — keep in sync with DealStatus enum)
export const DEAL_STATUS: Record<number, string> = {
  0: "Created",
  1: "Accepted",
  2: "Delivered",
  3: "Completed",
  4: "Disputed",
  5: "Refunded",
  6: "Expired",
  7: "Resolved",   // AI Judge resolved
};

// Safe BigInt parser — throws 400-friendly error on bad input
export function parseBigIntParam(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) {
    const err = new Error(`Invalid ${name}: must be a non-negative integer`);
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  return BigInt(value);
}

// Serialize BigInt-containing objects for JSON responses
export function serialize<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}
