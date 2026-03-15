/**
 * x402 Payment Required middleware for Nastar API.
 *
 * Uses the official x402-express package (Coinbase/Base).
 * Premium endpoints require an on-chain micropayment on Base Sepolia.
 *
 * Why Base Sepolia for payments when Nastar runs on Celo?
 * - x402 is Base-native (Coinbase's protocol)
 * - Premium API access is a separate concern from marketplace logic
 * - Demonstrates cross-chain composability: Celo data, Base payments
 *
 * Spec: https://x402.org
 * Package: https://www.npmjs.com/package/x402-express
 */

import { paymentMiddleware, type Network } from "x402-express";
import { Request, Response, NextFunction } from "express";

const PAY_TO = (process.env.SERVER_WALLET || "0xA5844eeF46b34894898b7050CEF5F4D225e92fbE") as `0x${string}`;
const NETWORK: Network = (process.env.X402_NETWORK || "base-sepolia") as Network;
const DEV_MODE = PAY_TO === "0x0000000000000000000000000000000000000000";

// ─── Route price config ───────────────────────────────────────────────────────

const PROTECTED_ROUTES = {
  "/deals/analytics/summary": {
    price: "$0.001" as const,
    network: NETWORK,
    config: { description: "Nastar — marketplace-wide deal analytics" },
  },
  "/services/search/query": {
    price: "$0.001" as const,
    network: NETWORK,
    config: { description: "Nastar — full-text service search" },
  },
};

// ─── Build the real x402 middleware ──────────────────────────────────────────

let _x402Middleware: ReturnType<typeof paymentMiddleware> | null = null;

function getX402Middleware() {
  if (!_x402Middleware) {
    _x402Middleware = paymentMiddleware(PAY_TO, PROTECTED_ROUTES, {
      url: "https://x402.org/facilitator",
    });
  }
  return _x402Middleware;
}

// ─── Per-route middleware (drop-in for x402Required) ─────────────────────────

export function x402Required(req: Request, res: Response, next: NextFunction) {
  if (DEV_MODE) {
    console.warn("[x402] SERVER_WALLET not set — skipping payment check (dev mode)");
    return next();
  }
  return getX402Middleware()(req, res, next);
}

// ─── App-level middleware (attach to Express app for all protected routes) ────
// Usage: app.use(x402AppMiddleware)

export function x402AppMiddleware(req: Request, res: Response, next: NextFunction) {
  if (DEV_MODE) return next();
  return getX402Middleware()(req, res, next);
}

export { PAY_TO, NETWORK, PROTECTED_ROUTES };
