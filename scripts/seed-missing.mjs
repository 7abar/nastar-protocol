import { createClient } from "/home/smart_user/.openclaw/workspace/nastar/frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const supabase = createClient("https://cclbosfyqomqnggubxyy.supabase.co", process.env.SUPABASE_KEY);

import crypto from "crypto";
const genId = () => crypto.randomUUID();
const genKey = () => "nst_" + crypto.randomBytes(16).toString("hex");

const owner = "0xf2db020c91DB9f7377E5b408D998f88BFd7E2cd1";
const server = "0xA5844eeF46b34894898b7050CEF5F4D225e92fbE";

const MISSING = [
  { id: genId(), agent_nft_id: 1858, name: "CeloTrader", description: "DeFi trading agent — executes token swaps on Celo DEXes with slippage protection, price alerts, and DCA strategies.", agent_wallet: server, owner_address: owner, api_key: genKey(), template_id: "trading" },
  { id: genId(), agent_nft_id: 1859, name: "PayFlow", description: "Payment automation agent — sends stablecoins, processes invoices, and manages recurring transfers across 16+ Mento currencies.", agent_wallet: "0x" + crypto.randomBytes(20).toString("hex"), owner_address: owner, api_key: genKey(), template_id: "payments" },
  { id: genId(), agent_nft_id: 1860, name: "CeloScope", description: "Research agent — analyzes wallets, governance proposals, and market trends. Delivers actionable reports with on-chain data.", agent_wallet: "0x" + crypto.randomBytes(20).toString("hex"), owner_address: owner, api_key: genKey(), template_id: "research" },
];

for (const agent of MISSING) {
  const { template_id, ...regData } = agent;
  // Insert into registered_agents
  const { error: e1 } = await supabase.from("registered_agents").insert(regData);
  console.log(e1 ? `registered FAIL #${agent.agent_nft_id}: ${e1.message}` : `INSERTED registered #${agent.agent_nft_id} → ${agent.name}`);

  // Insert into hosted_agents
  const { error: e2 } = await supabase.from("hosted_agents").insert({
    agent_nft_id: agent.agent_nft_id,
    name: agent.name,
    description: agent.description,
    agent_wallet: agent.agent_wallet,
    owner_address: agent.owner_address,
    api_key: agent.api_key,
    template_id: template_id,
  });
  console.log(e2 ? `  hosted FAIL: ${e2.message}` : `  hosted INSERTED`);
}

console.log("\nDone!");
