/**
 * x402 Payment Required middleware for Nastar API.
 *
 * x402 is a simple protocol for machine-native micropayments over HTTP.
 * When a client hits a premium endpoint without paying:
 *   1. Server returns 402 with payment instructions in headers
 *   2. Client sends on-chain payment to server wallet
 *   3. Client retries with X-Payment header containing tx proof
 *   4. Server verifies tx on-chain and serves the response
 *
 * Spec: https://x402.org
 */

import { Request, Response, NextFunction } from "express";
import { isAddress, isHex } from "viem";
import { publicClient, serialize } from "../lib/client.js";
import { X402_CONFIG, CONTRACTS } from "../config.js";
import { ERC20_ABI } from "../abis.js";

// In-memory cache of verified payment tx hashes (per server restart)
// In production: use Redis with TTL
const verifiedPayments = new Set<string>();

interface X402PaymentHeader {
  txHash: string;
  network: string;
  from: string;
  amount: string;
  token: string;
}

/**
 * Build the 402 payment details response body.
 */
function buildPaymentRequired(endpoint: string) {
  return {
    error: "Payment Required",
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: X402_CONFIG.network,
        amount: X402_CONFIG.priceWei.toString(),
        token: X402_CONFIG.token,
        payTo: X402_CONFIG.payTo,
        description: `Nastar API — premium access to ${endpoint}`,
      },
    ],
    instructions: [
      `1. Approve token spend: ERC20.approve(${X402_CONFIG.payTo}, ${X402_CONFIG.priceWei})`,
      `2. Transfer: ERC20.transfer(${X402_CONFIG.payTo}, ${X402_CONFIG.priceWei})`,
      `3. Retry request with header: X-Payment: {"txHash":"<hash>","network":"${X402_CONFIG.network}","from":"<your_address>","amount":"${X402_CONFIG.priceWei}","token":"${X402_CONFIG.token}"}`,
    ],
  };
}

/**
 * Verify an on-chain payment transaction.
 * Checks:
 * - tx exists and succeeded
 * - correct token transfer to server wallet
 * - amount >= required
 * - not already used (replay protection)
 */
async function verifyPayment(header: X402PaymentHeader): Promise<{ valid: boolean; reason?: string }> {
  const { txHash, from, amount, token } = header;

  if (!isHex(txHash)) return { valid: false, reason: "invalid txHash format" };
  if (!isAddress(from)) return { valid: false, reason: "invalid from address" };
  if (verifiedPayments.has(txHash)) return { valid: false, reason: "payment already used (replay)" };
  if (token.toLowerCase() !== X402_CONFIG.token.toLowerCase()) {
    return { valid: false, reason: `wrong token — expected ${X402_CONFIG.token}` };
  }
  if (BigInt(amount) < X402_CONFIG.priceWei) {
    return { valid: false, reason: `insufficient amount — min ${X402_CONFIG.priceWei}` };
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    if (receipt.status !== "success") {
      return { valid: false, reason: "transaction reverted" };
    }

    // Verify the tx actually transferred to server wallet
    // Parse Transfer event logs: Transfer(from, to, amount)
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const paymentFound = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== X402_CONFIG.token.toLowerCase()) return false;
      if (log.topics[0] !== transferTopic) return false;
      // topics[2] = to address (padded)
      const toAddr = "0x" + (log.topics[2] ?? "").slice(26);
      return toAddr.toLowerCase() === X402_CONFIG.payTo.toLowerCase();
    });

    if (!paymentFound) {
      return { valid: false, reason: "no valid Transfer to server wallet found in tx" };
    }

    verifiedPayments.add(txHash);
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `could not fetch tx: ${(err as Error).message}` };
  }
}

/**
 * x402 middleware factory.
 * Wrap any route to require an on-chain micropayment.
 *
 * Usage:
 *   router.get("/premium-endpoint", x402Required, handler)
 */
export async function x402Required(req: Request, res: Response, next: NextFunction) {
  // Skip if server wallet not configured (dev mode)
  if (X402_CONFIG.payTo === "0x0000000000000000000000000000000000000000") {
    console.warn("[x402] SERVER_WALLET not set — skipping payment check (dev mode)");
    return next();
  }

  const paymentHeader = req.headers["x-payment"] as string | undefined;

  if (!paymentHeader) {
    res.status(402).json(serialize(buildPaymentRequired(req.path)));
    return;
  }

  let parsed: X402PaymentHeader;
  try {
    parsed = JSON.parse(paymentHeader);
  } catch {
    res.status(400).json({ error: "X-Payment header is not valid JSON" });
    return;
  }

  const { valid, reason } = await verifyPayment(parsed);
  if (!valid) {
    res.status(402).json({
      error: "Payment verification failed",
      reason,
      ...(serialize(buildPaymentRequired(req.path)) as object),
    });
    return;
  }

  // Payment verified — attach metadata to request
  (req as Request & { x402From: string }).x402From = parsed.from;
  next();
}
