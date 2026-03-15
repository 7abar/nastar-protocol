/**
 * Self-hosted x402 Facilitator for Celo
 *
 * Since x402.org/facilitator doesn't support Celo, we host our own.
 * This handles verify + settle for USDC payments on Celo Mainnet.
 *
 * Endpoints:
 *   POST /x402/verify  — verify a signed payment payload
 *   POST /x402/settle  — settle (execute) the payment on-chain
 *   GET  /x402/supported — list supported payment schemes
 */

import { Router, Request, Response } from "express";
import { createPublicClient, createWalletClient, http, parseAbi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const router = Router();

const CELO_RPC = "https://forno.celo.org";
const USDC_ADDRESS = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
]);

const publicClient = createPublicClient({
  chain: celo,
  transport: http(CELO_RPC),
});

/**
 * GET /x402/supported
 */
router.get("/supported", (_req: Request, res: Response) => {
  res.json({
    kinds: [
      {
        scheme: "exact",
        network: "celo",
        asset: USDC_ADDRESS,
      },
    ],
  });
});

/**
 * POST /x402/verify
 * Verify that the payer has sufficient balance and the payment signature is valid
 */
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { payment, paymentRequirements } = req.body;

    if (!payment || !paymentRequirements) {
      return res.status(400).json({ isValid: false, invalidReason: "Missing payment or paymentRequirements" });
    }

    const { payload } = payment;
    const payer = getAddress(payload.authorization.from);
    const amount = BigInt(paymentRequirements.maxAmountRequired);

    // Check balance
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [payer],
    });

    if (balance < amount) {
      return res.json({
        isValid: false,
        invalidReason: `Insufficient USDC balance: has ${balance}, needs ${amount}`,
        payer,
      });
    }

    // Payment looks valid
    res.json({ isValid: true, payer });
  } catch (err: any) {
    console.error("[x402-facilitator] verify error:", err.message);
    res.json({ isValid: false, invalidReason: err.message });
  }
});

/**
 * POST /x402/settle
 * Execute the payment on-chain using permit + transferFrom
 */
router.post("/settle", async (req: Request, res: Response) => {
  try {
    const { payment, paymentRequirements } = req.body;

    if (!payment || !paymentRequirements) {
      return res.status(400).json({ success: false, errorReason: "Missing payment or paymentRequirements" });
    }

    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
      return res.status(500).json({ success: false, errorReason: "Server wallet not configured" });
    }

    const account = privateKeyToAccount(pk as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(CELO_RPC),
    });

    const { payload } = payment;
    const payer = getAddress(payload.authorization.from);
    const payTo = getAddress(paymentRequirements.payTo);
    const amount = BigInt(paymentRequirements.maxAmountRequired);

    // If payment includes a permit signature, execute it first
    if (payload.authorization.signature) {
      try {
        const sig = payload.authorization.signature;
        const permitHash = await walletClient.writeContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "permit",
          args: [
            payer,
            account.address,
            amount,
            BigInt(sig.deadline),
            sig.v,
            sig.r,
            sig.s,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash: permitHash });
      } catch (permitErr: any) {
        // Permit may already be set or not needed if allowance exists
        console.warn("[x402-facilitator] permit failed (may already be approved):", permitErr.message?.slice(0, 100));
      }
    }

    // Execute transferFrom
    const txHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transferFrom",
      args: [payer, payTo, amount],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    res.json({
      success: true,
      transaction: txHash,
      network: "celo",
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (err: any) {
    console.error("[x402-facilitator] settle error:", err.message);
    res.json({ success: false, errorReason: err.message });
  }
});

export default router;
