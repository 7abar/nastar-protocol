/**
 * /v1/oracle — Hybrid FX Price Oracle
 *
 * Sources:
 *  - Pyth Network (hermes.pyth.network) — real-world FX rates
 *  - Mento Protocol (on-chain quotes)   — actual swap rates
 *
 * GET /v1/oracle/rates          — full FX rate matrix (all pairs)
 * GET /v1/oracle/rates/:from/:to — specific pair
 * GET /v1/oracle/sources         — oracle health + last update per source
 *
 * Why two sources?
 * Divergence between Pyth (real-world) and Mento (on-chain) reveals:
 *  - Arbitrage opportunities
 *  - Oracle lag / circuit breaker events
 *  - Trust pricing signal for agent deals
 */

import { Router, Request, Response } from "express";
// Use require to force CJS path (ESM build of mento-sdk has broken internal imports)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Mento, ChainId } = require("@mento-protocol/mento-sdk") as typeof import("@mento-protocol/mento-sdk");
import { parseUnits, formatUnits } from "viem";
import { TOKENS, getTokenMeta } from "../config.js";

const router = Router();

// ─── Pyth price feed IDs (FX) ─────────────────────────────────────────────────
// Source: hermes.pyth.network/v2/price_feeds?asset_type=fx
const PYTH_IDS: Record<string, { id: string; description: string; invert?: boolean }> = {
  // EUR/USD — direct
  EURm: {
    id: "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b",
    description: "EUR/USD",
  },
  // USD/BRL — invert to get BRL/USD (units per USD)
  BRLm: {
    id: "0xd2db4dbf1aea74e0f666b0e8f73b9580d407f5e5cf931940b06dc633d7a95906",
    description: "USD/BRL",
    invert: true,
  },
  // USD/XOF — invert to get XOF/USD (units per USD)
  XOFm: {
    id: "0x78ce64c90dff33ef577f5da2c8b69d47c8a32bd8791e3ce49e3f2c1ee43f2f9e",
    description: "USD/XOF",
    invert: true,
  },
};

const PYTH_URL = "https://hermes.pyth.network/v2/updates/price/latest";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateEntry {
  from: string;
  to: string;
  fromAddress: string;
  toAddress: string;
  onchain: number | null;      // Mento swap rate
  pyth: number | null;         // Pyth real-world rate
  divergencePct: number | null; // % diff between sources
  displayRate: string;
  source: "mento" | "pyth" | "mento+pyth";
  timestamp: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface OracleCache {
  rates: Record<string, RateEntry>;
  lastUpdated: number;
  pythStatus: "ok" | "error" | "stale";
  mentoStatus: "ok" | "error";
}

let cache: OracleCache | null = null;
const CACHE_TTL = 30_000; // 30 seconds

// ─── Mento SDK ────────────────────────────────────────────────────────────────

let _mento: any | null = null;
async function getMento(): Promise<any> {
  if (!_mento) _mento = await Mento.create(ChainId.CELO_SEPOLIA);
  return _mento;
}

// ─── Fetch Pyth prices ────────────────────────────────────────────────────────

async function fetchPythPrices(): Promise<Record<string, number>> {
  const ids = Object.values(PYTH_IDS).map(f => f.id);
  const url = `${PYTH_URL}?${ids.map(id => `ids[]=${id}`).join("&")}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Pyth HTTP ${res.status}`);

  const data = await res.json() as any;
  const parsed = data.parsed as Array<{
    id: string;
    price: { price: string; expo: number; publish_time: number };
  }>;

  const result: Record<string, number> = {};

  for (const [symbol, feed] of Object.entries(PYTH_IDS)) {
    const entry = parsed.find(p => `0x${p.id}` === feed.id || p.id === feed.id.replace("0x", ""));
    if (!entry) continue;

    const rawPrice = parseInt(entry.price.price) * Math.pow(10, entry.price.expo);
    result[symbol] = feed.invert ? 1 / rawPrice : rawPrice;
  }

  return result;
}

// ─── Fetch Mento on-chain rate ────────────────────────────────────────────────

async function fetchMentoRate(fromSymbol: string, toSymbol: string): Promise<number | null> {
  try {
    const mento = await getMento();
    const fromAddr = (TOKENS as Record<string, string>)[fromSymbol];
    const toAddr = (TOKENS as Record<string, string>)[toSymbol];
    if (!fromAddr || !toAddr) return null;

    const metaFrom = getTokenMeta(fromAddr);
    const amountIn = parseUnits("1", metaFrom.decimals);
    const amountOut = await mento.quotes.getAmountOut(fromAddr, toAddr, amountIn);
    const metaTo = getTokenMeta(toAddr);
    return parseFloat(formatUnits(amountOut, metaTo.decimals));
  } catch {
    return null;
  }
}

// ─── Build full rate matrix ───────────────────────────────────────────────────

async function buildRates(): Promise<OracleCache> {
  const now = Date.now();
  const tokenSymbols = Object.keys(TOKENS);
  const rates: Record<string, RateEntry> = {};

  // Fetch Pyth in parallel with Mento
  let pythPrices: Record<string, number> = {};
  let pythStatus: OracleCache["pythStatus"] = "ok";

  try {
    pythPrices = await fetchPythPrices();
  } catch (err) {
    console.error("[Oracle] Pyth fetch failed:", (err as Error).message);
    pythStatus = "error";
  }

  // Build all USD→X rates from Pyth (with USDm as base)
  const pythUsdRates: Record<string, number> = { USDm: 1 };
  for (const [sym, price] of Object.entries(pythPrices)) {
    // EUR/USD price = how many USD per EUR → to get EURm/USDm, it's the rate
    // USD/BRL (inverted) = how many BRL per USD → same logic
    pythUsdRates[sym] = price;
  }

  // Build rates for each pair
  let mentoStatus: OracleCache["mentoStatus"] = "ok";

  for (let i = 0; i < tokenSymbols.length; i++) {
    for (let j = 0; j < tokenSymbols.length; j++) {
      if (i === j) continue;
      const fromSym = tokenSymbols[i];
      const toSym = tokenSymbols[j];
      const key = `${fromSym}/${toSym}`;
      const fromAddr = (TOKENS as Record<string, string>)[fromSym];
      const toAddr = (TOKENS as Record<string, string>)[toSym];

      // Mento on-chain quote
      let onchain: number | null = null;
      try {
        onchain = await fetchMentoRate(fromSym, toSym);
      } catch {
        mentoStatus = "error";
      }

      // Pyth-derived cross rate: from/to = (from/USD) / (to/USD)
      let pyth: number | null = null;
      const fromUsd = fromSym === "USDm" ? 1 : (pythUsdRates[fromSym] ?? null);
      const toUsd = toSym === "USDm" ? 1 : (pythUsdRates[toSym] ?? null);

      if (fromUsd !== null && toUsd !== null && toUsd !== 0) {
        if (fromSym === "USDm") {
          // USDm → EURm: rate = EUR/USD price
          pyth = pythUsdRates[toSym] ?? null;
        } else if (toSym === "USDm") {
          // EURm → USDm: rate = 1/(EUR/USD)
          pyth = pythUsdRates[fromSym] ? 1 / pythUsdRates[fromSym] : null;
        } else {
          // Cross rate: from/to via USD
          pyth = fromUsd && toUsd ? fromUsd / toUsd : null;
        }
      }

      // Divergence
      let divergencePct: number | null = null;
      if (onchain !== null && pyth !== null && pyth !== 0) {
        divergencePct = Math.abs((onchain - pyth) / pyth) * 100;
      }

      const displayRate = onchain !== null ? onchain.toFixed(6) : pyth !== null ? pyth.toFixed(6) : "N/A";
      const source: RateEntry["source"] =
        onchain !== null && pyth !== null ? "mento+pyth" :
        onchain !== null ? "mento" : "pyth";

      rates[key] = {
        from: fromSym,
        to: toSym,
        fromAddress: fromAddr,
        toAddress: toAddr,
        onchain,
        pyth,
        divergencePct: divergencePct !== null ? Math.round(divergencePct * 100) / 100 : null,
        displayRate,
        source,
        timestamp: now,
      };
    }
  }

  return { rates, lastUpdated: now, pythStatus, mentoStatus };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

async function getCache(): Promise<OracleCache> {
  if (!cache || Date.now() - cache.lastUpdated > CACHE_TTL) {
    cache = await buildRates();
  }
  return cache;
}

// GET /v1/oracle/rates
router.get("/rates", async (_req: Request, res: Response) => {
  try {
    const data = await getCache();
    return res.json({
      rates: data.rates,
      summary: {
        totalPairs: Object.keys(data.rates).length,
        sources: {
          pyth: { status: data.pythStatus, description: "Real-world FX via Pyth Network" },
          mento: { status: data.mentoStatus, description: "On-chain swap rates via Mento Protocol" },
        },
        lastUpdated: data.lastUpdated,
        cacheTtlMs: CACHE_TTL,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET /v1/oracle/rates/:from/:to  — e.g. /rates/USDm/EURm
router.get("/rates/:from/:to", async (req: Request, res: Response) => {
  try {
    const { from, to } = req.params;
    // Case-sensitive lookup — token symbols are mixed case (e.g. "USDm", not "USDM")
    const key = `${from}/${to}`;
    const data = await getCache();
    const rate = data.rates[key];
    if (!rate) {
      return res.status(404).json({
        error: `No rate for ${key}`,
        available: Object.keys(data.rates),
      });
    }
    return res.json(rate);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET /v1/oracle/sources
router.get("/sources", async (_req: Request, res: Response) => {
  try {
    const data = await getCache();
    // Find max divergence pair as health indicator
    const divPairs = Object.values(data.rates)
      .filter(r => r.divergencePct !== null)
      .sort((a, b) => (b.divergencePct ?? 0) - (a.divergencePct ?? 0))
      .slice(0, 3);

    return res.json({
      sources: [
        {
          name: "Pyth Network",
          type: "external",
          status: data.pythStatus,
          description: "Real-world FX reference rates",
          url: "https://hermes.pyth.network",
          currencies: Object.keys(PYTH_IDS),
          lastUpdated: data.lastUpdated,
        },
        {
          name: "Mento Protocol",
          type: "onchain",
          status: data.mentoStatus,
          description: "On-chain swap rates from Mento AMM pools",
          network: "Celo Sepolia (chainId 11142220)",
          currencies: Object.keys(TOKENS),
          lastUpdated: data.lastUpdated,
        },
      ],
      divergenceAlerts: divPairs.map(r => ({
        pair: `${r.from}/${r.to}`,
        divergencePct: r.divergencePct,
        onchain: r.onchain,
        pyth: r.pyth,
        alert: (r.divergencePct ?? 0) > 1 ? "HIGH" : "OK",
      })),
      lastUpdated: data.lastUpdated,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
