/**
 * /v1/swap — Mento Protocol multi-currency swap
 *
 * GET  /v1/swap/quote   — get exchange rate + expected output
 * POST /v1/swap/build   — build approval + swap tx params (no execution)
 * GET  /v1/swap/pairs   — list all tradable token pairs
 */

import { Router, Request, Response } from "express";
// Use require to force CJS path (ESM build of mento-sdk has broken internal imports)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Mento, ChainId, deadlineFromMinutes } = require("@mento-protocol/mento-sdk") as typeof import("@mento-protocol/mento-sdk");
import { parseUnits, formatUnits, isAddress } from "viem";
import { CELO_TOKENS, getTokenMeta } from "../config.js";

const router = Router();

// ─── Mento SDK singleton (lazy init) ──────────────────────────────────────────

let _mento: any | null = null;

async function getMento(): Promise<any> {
  if (!_mento) {
    _mento = await Mento.create(ChainId.CELO_SEPOLIA);
  }
  return _mento;
}

// ─── GET /v1/swap/pairs ───────────────────────────────────────────────────────

router.get("/pairs", async (_req: Request, res: Response) => {
  try {
    const mento = await getMento();
    const pools = await mento.pools.getPools();

    const pairs = pools.map((pool: any) => ({
      poolAddress: pool.address,
      token0: { address: pool.token0.address, ...getTokenMeta(pool.token0.address) },
      token1: { address: pool.token1.address, ...getTokenMeta(pool.token1.address) },
    }));

    return res.json({ pairs, count: pairs.length });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /v1/swap/quote ───────────────────────────────────────────────────────
// ?tokenIn=0x...&tokenOut=0x...&amountIn=100
// ?from=USDm&to=EURm&amount=100  (symbol shorthand)

router.get("/quote", async (req: Request, res: Response) => {
  try {
    const { tokenIn: rawIn, tokenOut: rawOut, amountIn: rawAmt, from, to, amount } = req.query as Record<string, string>;

    // Resolve symbol → address shorthand
    const tokenIn = (rawIn || (from ? (CELO_TOKENS as Record<string, string>)[from] : "")) as string;
    const tokenOut = (rawOut || (to ? (CELO_TOKENS as Record<string, string>)[to] : "")) as string;
    const amountStr = rawAmt || amount || "1";

    if (!tokenIn || !tokenOut) return res.status(400).json({ error: "tokenIn and tokenOut (or from/to symbols) required" });
    if (!isAddress(tokenIn) || !isAddress(tokenOut)) return res.status(400).json({ error: "Invalid token addresses" });

    const metaIn = getTokenMeta(tokenIn);
    const metaOut = getTokenMeta(tokenOut);
    const amountInWei = parseUnits(amountStr, metaIn.decimals);

    const mento = await getMento();
    const expectedOut = await mento.quotes.getAmountOut(tokenIn, tokenOut, amountInWei);
    const amountOutFormatted = formatUnits(expectedOut, metaOut.decimals);

    const rate = parseFloat(amountOutFormatted) / parseFloat(amountStr);

    return res.json({
      tokenIn: { address: tokenIn, ...metaIn },
      tokenOut: { address: tokenOut, ...metaOut },
      amountIn: amountStr,
      amountInWei: amountInWei.toString(),
      expectedAmountOut: amountOutFormatted,
      expectedAmountOutWei: expectedOut.toString(),
      exchangeRate: rate.toFixed(6),
      priceImpact: "< 0.1%",
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("route") || msg.includes("Route")) {
      return res.status(404).json({ error: "No trading route found for this pair" });
    }
    return res.status(500).json({ error: msg });
  }
});

// ─── POST /v1/swap/build ──────────────────────────────────────────────────────
// Body: { tokenIn, tokenOut, amountIn, recipient, slippageTolerance?, deadlineMinutes? }

router.post("/build", async (req: Request, res: Response) => {
  try {
    const {
      tokenIn,
      tokenOut,
      amountIn,
      recipient,
      owner,
      slippageTolerance = 0.5,
      deadlineMinutes = 10,
      from,
      to,
    } = req.body;

    const resolvedIn = tokenIn || (from ? (CELO_TOKENS as Record<string, string>)[from] : "");
    const resolvedOut = tokenOut || (to ? (CELO_TOKENS as Record<string, string>)[to] : "");

    if (!resolvedIn || !resolvedOut) return res.status(400).json({ error: "tokenIn/tokenOut or from/to required" });
    if (!amountIn) return res.status(400).json({ error: "amountIn required" });
    if (!recipient) return res.status(400).json({ error: "recipient address required" });
    if (!isAddress(resolvedIn) || !isAddress(resolvedOut)) return res.status(400).json({ error: "Invalid token address" });
    if (!isAddress(recipient)) return res.status(400).json({ error: "Invalid recipient address" });

    const metaIn = getTokenMeta(resolvedIn);
    const amountInWei = parseUnits(String(amountIn), metaIn.decimals);
    const ownerAddr = owner || recipient;

    const mento = await getMento();

    const { approval, swap } = await mento.swap.buildSwapTransaction(
      resolvedIn,
      resolvedOut,
      amountInWei,
      recipient,
      ownerAddr,
      {
        slippageTolerance: Number(slippageTolerance),
        deadline: deadlineFromMinutes(Number(deadlineMinutes)),
      }
    );

    const metaOut = getTokenMeta(resolvedOut);
    const expectedFormatted = formatUnits(swap.expectedAmountOut, metaOut.decimals);
    const minFormatted = formatUnits(swap.amountOutMin, metaOut.decimals);

    return res.json({
      tokenIn: { address: resolvedIn, ...metaIn },
      tokenOut: { address: resolvedOut, ...metaOut },
      amountIn: String(amountIn),
      expectedAmountOut: expectedFormatted,
      minAmountOut: minFormatted,
      slippageTolerance,
      // Transactions to execute in order:
      transactions: [
        ...(approval ? [{
          step: 1,
          type: "approval",
          description: `Approve ${metaIn.name || resolvedIn} for Mento Router`,
          to: approval.to,
          data: approval.data,
          value: approval.value?.toString() ?? "0",
        }] : []),
        {
          step: approval ? 2 : 1,
          type: "swap",
          description: `Swap ${amountIn} ${metaIn.name} → ${expectedFormatted} ${metaOut.name}`,
          to: swap.params.to,
          data: swap.params.data,
          value: swap.params.value?.toString() ?? "0",
        },
      ],
      totalSteps: approval ? 2 : 1,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("route") || msg.includes("Route")) {
      return res.status(404).json({ error: "No trading route found for this pair" });
    }
    return res.status(500).json({ error: msg });
  }
});

export default router;
