/**
 * Molthunt Integration
 *
 * Auto-registers agents launched on Nastar as projects on Molthunt.
 * Uses SIWA (Sign In With Agent) with Celo ERC-8004 registry.
 *
 * Flow:
 * 1. Get nonce from Molthunt
 * 2. Sign SIWA message with agent wallet
 * 3. Verify → get receipt
 * 4. Create project on Molthunt
 */

import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

const MOLTHUNT_API = "https://www.molthunt.com/api/v1";
const CELO_REGISTRY = "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

interface AgentInfo {
  name: string;
  description: string;
  agentNftId: number;
  agentWallet: string;
  agentPrivateKey: string;
  avatar?: string;
  templateId?: string;
}

const TEMPLATE_CATEGORIES: Record<string, string[]> = {
  trading: ["cat_fintech", "cat_ai"],
  payments: ["cat_fintech", "cat_web3"],
  social: ["cat_ai", "cat_marketing"],
  research: ["cat_ai", "cat_developer-tools"],
  remittance: ["cat_fintech", "cat_web3"],
  "fx-hedge": ["cat_fintech", "cat_ai"],
  custom: ["cat_ai", "cat_web3"],
};

/**
 * Step 1: Get SIWA nonce
 */
async function getNonce(address: string, agentId: number): Promise<{ nonce: string } | null> {
  try {
    const res = await fetch(`${MOLTHUNT_API}/siwa/nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        agentId,
        agentRegistry: CELO_REGISTRY,
      }),
    });
    const data: any = await res.json();
    if (data.success) return data.data;
    console.error("[molthunt] nonce error:", data);
    return null;
  } catch (err) {
    console.error("[molthunt] nonce fetch error:", err);
    return null;
  }
}

/**
 * Step 2+3: Sign SIWA message and verify
 */
async function signAndVerify(
  privateKey: string,
  address: string,
  agentId: number,
  nonce: string
): Promise<string | null> {
  try {
    const account = privateKeyToAccount(privateKey as Hex);

    // Build SIWA message (EIP-4361 style)
    const domain = "www.molthunt.com";
    const uri = "https://www.molthunt.com";
    const issuedAt = new Date().toISOString();
    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      address,
      "",
      `Sign in to Molthunt as Agent #${agentId}`,
      "",
      `URI: ${uri}`,
      `Version: 1`,
      `Chain ID: 42220`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join("\n");

    const signature = await account.signMessage({ message });

    const res = await fetch(`${MOLTHUNT_API}/siwa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    const data: any = await res.json();
    if (data.success) return data.data.receipt;
    console.error("[molthunt] verify error:", data);
    return null;
  } catch (err) {
    console.error("[molthunt] sign/verify error:", err);
    return null;
  }
}

/**
 * Step 4: Create project on Molthunt
 */
async function createProject(receipt: string, agent: AgentInfo): Promise<any> {
  try {
    const categories = TEMPLATE_CATEGORIES[agent.templateId || "custom"] || ["cat_ai", "cat_web3"];

    const res = await fetch(`${MOLTHUNT_API}/projects`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${receipt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: agent.name,
        tagline: agent.description.slice(0, 200) || `AI agent on Nastar Protocol — ERC-8004 #${agent.agentNftId}`,
        description: [
          agent.description,
          "",
          `**Agent Details:**`,
          `- ERC-8004 Identity: #${agent.agentNftId} on Celo`,
          `- Wallet: ${agent.agentWallet}`,
          `- Template: ${agent.templateId || "custom"}`,
          `- Platform: [Nastar Protocol](https://nastar.fun)`,
          "",
          `View on Nastar: https://nastar.fun/agents/${agent.agentNftId}`,
        ].join("\n"),
        logo_url: agent.avatar && agent.avatar.startsWith("http") ? agent.avatar : "https://nastar.fun/logo-icon.png",
        website_url: `https://nastar.fun/agents/${agent.agentNftId}`,
        github_url: "https://github.com/7abar/nastar",
        category_ids: categories,
      }),
    });
    const data: any = await res.json();
    if (data.success) {
      console.log(`[molthunt] Project created: ${data.project?.id} for agent #${agent.agentNftId}`);
      return data;
    }
    console.error("[molthunt] project creation error:", data);
    return null;
  } catch (err) {
    console.error("[molthunt] project creation fetch error:", err);
    return null;
  }
}

/**
 * Main: Register agent on Molthunt
 * Called after successful deploy on Nastar
 */
export async function registerOnMolthunt(agent: AgentInfo): Promise<{ success: boolean; projectId?: string }> {
  console.log(`[molthunt] Registering agent #${agent.agentNftId} (${agent.name})...`);

  // Skip if no private key
  if (!agent.agentPrivateKey) {
    console.log("[molthunt] No agent private key, skipping");
    return { success: false };
  }

  // 1. Get nonce
  const nonceData = await getNonce(agent.agentWallet, agent.agentNftId);
  if (!nonceData) return { success: false };

  // 2+3. Sign and verify
  const receipt = await signAndVerify(
    agent.agentPrivateKey,
    agent.agentWallet,
    agent.agentNftId,
    nonceData.nonce
  );
  if (!receipt) return { success: false };

  // 4. Create project
  const result = await createProject(receipt, agent);
  if (!result) return { success: false };

  return { success: true, projectId: result.project?.id };
}
