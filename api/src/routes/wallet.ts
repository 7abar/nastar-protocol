/**
 * User Custodial Wallets (ACP-style)
 *
 * Each user gets a Nastar Wallet for frictionless transactions.
 * Server holds encrypted keys, executes transactions on behalf of user.
 *
 * POST /v1/wallet/create     — generate wallet for user
 * GET  /v1/wallet/balance     — check balances
 * POST /v1/wallet/hire        — auto-execute approve + createDeal
 */

import { Router, Request, Response } from "express";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseAbi,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { CONTRACTS } from "../config.js";

const router = Router();
const CELO_RPC = "https://forno.celo.org";

const publicClient = createPublicClient({ chain: celo, transport: http(CELO_RPC) });

const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || process.env.PRIVATE_KEY?.slice(2, 66) || "0".repeat(64);

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(64, "0").slice(0, 64), "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(data: string): string {
  const [ivHex, encrypted] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(64, "0").slice(0, 64), "hex"), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

const IDENTITY_ABI = parseAbi([
  "function register() returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function transferFrom(address from, address to, uint256 tokenId)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
]);

const ESCROW_ABI = parseAbi([
  "function createDeal(uint256 serviceId, uint256 buyerAgentId, uint256 sellerAgentId, address paymentToken, uint256 amount, string description, uint256 deadline, bool autoConfirm) returns (uint256)",
]);

// Known stablecoins on Celo
const STABLECOINS: Record<string, { address: string; decimals: number; symbol: string }> = {
  cUSD: { address: "0x765DE816845861e75A25fCA122bb6898B8B1282a", decimals: 18, symbol: "cUSD" },
  USDC: { address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6, symbol: "USDC" },
  USDT: { address: "0x48065fbbe25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6, symbol: "USDT" },
};

/**
 * POST /v1/wallet/create
 * Generate a custodial wallet for a user
 */
router.post("/create", async (req: Request, res: Response) => {
  try {
    const { ownerAddress } = req.body;
    if (!ownerAddress) return res.status(400).json({ error: "ownerAddress required" });

    const sb = getSupabase();

    // Check if already has a wallet
    const { data: existing } = await sb
      .from("user_wallets")
      .select("wallet_address, agent_nft_id")
      .eq("owner_address", ownerAddress.toLowerCase());

    if (existing && existing.length > 0) {
      return res.json({
        success: true,
        walletAddress: existing[0].wallet_address,
        agentNftId: existing[0].agent_nft_id,
        alreadyExists: true,
      });
    }

    // Generate new wallet
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);

    // Encrypt and store
    const encrypted = encrypt(pk);
    await sb.from("user_wallets").insert({
      owner_address: ownerAddress.toLowerCase(),
      wallet_address: account.address.toLowerCase(),
      encrypted_key: encrypted,
    });

    // Mint ERC-8004 identity for this wallet (server sponsors gas)
    let agentNftId: number | null = null;
    try {
      const sponsorPk = process.env.PRIVATE_KEY;
      if (sponsorPk) {
        const sponsorAccount = privateKeyToAccount(sponsorPk as Hex);
        const sponsorWallet = createWalletClient({ account: sponsorAccount, chain: celo, transport: http(CELO_RPC) });

        // Mint to server wallet
        const mintHash = await sponsorWallet.writeContract({
          address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
          abi: IDENTITY_ABI,
          functionName: "register",
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });

        const transferLog = receipt.logs.find(
          (l) => l.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        );
        if (transferLog?.topics[3]) {
          agentNftId = Number(BigInt(transferLog.topics[3]));

          // Transfer to the custodial wallet
          const txHash = await sponsorWallet.writeContract({
            address: CONTRACTS.IDENTITY_REGISTRY as `0x${string}`,
            abi: IDENTITY_ABI,
            functionName: "transferFrom",
            args: [sponsorAccount.address, account.address, BigInt(agentNftId)],
          });
          await publicClient.waitForTransactionReceipt({ hash: txHash });

          // Update DB
          await sb.from("user_wallets")
            .update({ agent_nft_id: agentNftId })
            .eq("wallet_address", account.address.toLowerCase());
        }
      }
    } catch (e: any) {
      console.error("[wallet] identity mint error (non-critical):", e.message);
    }

    return res.json({
      success: true,
      walletAddress: account.address,
      agentNftId,
    });
  } catch (err: any) {
    console.error("[wallet] create error:", err.message);
    return res.status(500).json({ error: err.message?.slice(0, 200) || "Create failed" });
  }
});

/**
 * GET /v1/wallet/balance?ownerAddress=0x...
 * Check balances of user's custodial wallet
 */
router.get("/balance", async (req: Request, res: Response) => {
  try {
    const ownerAddress = (req.query.ownerAddress as string || "").toLowerCase();
    if (!ownerAddress) return res.status(400).json({ error: "ownerAddress required" });

    const sb = getSupabase();
    const { data } = await sb
      .from("user_wallets")
      .select("wallet_address, agent_nft_id")
      .eq("owner_address", ownerAddress);

    if (!data || data.length === 0) {
      return res.json({ exists: false, walletAddress: null, balances: {} });
    }

    const walletAddr = data[0].wallet_address as `0x${string}`;
    const balances: Record<string, string> = {};

    // Check CELO balance
    const celoBalance = await publicClient.getBalance({ address: walletAddr });
    balances["CELO"] = formatUnits(celoBalance, 18);

    // Check stablecoin balances
    for (const [symbol, token] of Object.entries(STABLECOINS)) {
      try {
        const bal = await publicClient.readContract({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [walletAddr],
        });
        balances[symbol] = formatUnits(bal as bigint, token.decimals);
      } catch {}
    }

    return res.json({
      exists: true,
      walletAddress: walletAddr,
      agentNftId: data[0].agent_nft_id,
      balances,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message?.slice(0, 200) });
  }
});

/**
 * POST /v1/wallet/hire
 * Execute approve + createDeal using the user's custodial wallet.
 * Zero popups — server signs everything.
 */
router.post("/hire", async (req: Request, res: Response) => {
  try {
    const { ownerAddress, serviceIndex, sellerAgentId, paymentToken, amount, serviceName } = req.body;

    if (!ownerAddress || sellerAgentId === undefined || !paymentToken || !amount) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sb = getSupabase();

    // Get user's custodial wallet
    const { data } = await sb
      .from("user_wallets")
      .select("wallet_address, encrypted_key, agent_nft_id")
      .eq("owner_address", ownerAddress.toLowerCase());

    if (!data || data.length === 0) {
      return res.status(400).json({ error: "No wallet found. Create one first via /v1/wallet/create" });
    }

    const walletAddr = data[0].wallet_address;
    const pk = decrypt(data[0].encrypted_key);
    const buyerAgentId = BigInt(data[0].agent_nft_id || 0);
    const account = privateKeyToAccount(pk as Hex);

    // User's wallet pays for the deal, but server sponsors gas
    // We need the user's wallet to be msg.sender (owns the identity NFT)
    const walletClient = createWalletClient({ account, chain: celo, transport: http(CELO_RPC) });

    const amountBn = BigInt(amount);
    const tokenAddr = paymentToken as `0x${string}`;
    const escrowAddr = CONTRACTS.NASTAR_ESCROW as `0x${string}`;

    // Check balance
    const balance = await publicClient.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });

    if ((balance as bigint) < amountBn) {
      return res.status(400).json({
        error: `Insufficient balance. Need ${formatUnits(amountBn, 18)} but have ${formatUnits(balance as bigint, 18)}. Deposit to ${walletAddr}`,
        walletAddress: walletAddr,
        required: amount,
        available: (balance as bigint).toString(),
      });
    }

    // Check if user wallet has CELO for gas
    const celoBalance = await publicClient.getBalance({ address: account.address });
    if (celoBalance < BigInt("10000000000000000")) { // < 0.01 CELO
      // Sponsor gas: send 0.05 CELO from server wallet
      try {
        const sponsorPk = process.env.PRIVATE_KEY;
        if (sponsorPk) {
          const sponsorAccount = privateKeyToAccount(sponsorPk as Hex);
          const sponsorWallet = createWalletClient({ account: sponsorAccount, chain: celo, transport: http(CELO_RPC) });
          const gasHash = await sponsorWallet.sendTransaction({
            to: account.address,
            value: BigInt("50000000000000000"), // 0.05 CELO
          });
          await publicClient.waitForTransactionReceipt({ hash: gasHash });
        }
      } catch (e: any) {
        console.error("[wallet] gas sponsor error:", e.message);
      }
    }

    const txHashes: string[] = [];

    // Step 1: Approve escrow (max approve for future hires)
    const allowance = await publicClient.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, escrowAddr],
    });

    if ((allowance as bigint) < amountBn) {
      const maxUint = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      const appHash = await walletClient.writeContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [escrowAddr, maxUint],
      });
      await publicClient.waitForTransactionReceipt({ hash: appHash });
      txHashes.push(appHash);
    }

    // Step 2: Create deal
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
    const dealHash = await walletClient.writeContract({
      address: escrowAddr,
      abi: ESCROW_ABI,
      functionName: "createDeal",
      args: [
        BigInt(serviceIndex),
        buyerAgentId,
        BigInt(sellerAgentId),
        tokenAddr,
        amountBn,
        `Hired via Nastar: ${serviceName || "agent"}`,
        deadline,
        true, // autoConfirm
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: dealHash });
    txHashes.push(dealHash);

    return res.json({
      success: true,
      dealTxHash: dealHash,
      txHashes,
      gasSponsored: true,
    });

  } catch (err: any) {
    console.error("[wallet] hire error:", err.message);
    return res.status(500).json({ error: err.message?.slice(0, 200) || "Hire failed" });
  }
});

export default router;
