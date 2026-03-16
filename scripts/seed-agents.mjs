import { createClient } from "/home/smart_user/.openclaw/workspace/nastar/frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const SUPABASE_URL = "https://cclbosfyqomqnggubxyy.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_KEY) { console.error("Set SUPABASE_KEY"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEMO_AGENTS = [
  { agent_nft_id: 1858, name: "CeloTrader", description: "DeFi trading agent — executes token swaps on Celo DEXes with slippage protection, price alerts, and DCA strategies.", template_id: "trading" },
  { agent_nft_id: 1859, name: "PayFlow", description: "Payment automation agent — sends stablecoins, processes invoices, and manages recurring transfers across 16+ Mento currencies.", template_id: "payments" },
  { agent_nft_id: 1860, name: "CeloScope", description: "Research agent — analyzes wallets, governance proposals, and market trends. Delivers actionable reports with on-chain data.", template_id: "research" },
  { agent_nft_id: 1861, name: "RemitCelo", description: "Cross-border remittance agent — converts and sends money globally via Mento stablecoins. Cheaper than Western Union.", template_id: "remittance" },
  { agent_nft_id: 1862, name: "HedgeBot", description: "FX hedging agent — manages multi-currency exposure and auto-rebalances portfolios using Mento stablecoins.", template_id: "fx-hedge" },
  { agent_nft_id: 1876, name: "Anya", description: "AI content agent — writes threads, creates content calendars, analyzes community health, and builds brand voice kits for Web3 projects.", template_id: "social" },
  { agent_nft_id: 1883, name: "DAOkeeper", description: "DAO operations agent — manages treasury, tracks proposals, executes approved disbursements, and processes contributor payroll.", template_id: "dao-ops" },
  { agent_nft_id: 1906, name: "YieldMax", description: "DeFi yield optimizer — scans Celo protocols for best yields, manages liquidity positions, and auto-harvests rewards.", template_id: "defi-yield" },
];

for (const agent of DEMO_AGENTS) {
  // Update registered_agents
  const { data: existing } = await supabase.from("registered_agents").select("agent_nft_id").eq("agent_nft_id", agent.agent_nft_id);
  
  if (existing && existing.length > 0) {
    const { error } = await supabase.from("registered_agents").update({ name: agent.name, description: agent.description }).eq("agent_nft_id", agent.agent_nft_id);
    console.log(error ? `FAIL #${agent.agent_nft_id}: ${error.message}` : `UPDATED registered #${agent.agent_nft_id} → ${agent.name}`);
  } else {
    console.log(`SKIP #${agent.agent_nft_id} — not in registered_agents`);
  }

  // Update hosted_agents
  const { data: hosted } = await supabase.from("hosted_agents").select("agent_nft_id").eq("agent_nft_id", agent.agent_nft_id);
  if (hosted && hosted.length > 0) {
    const { error } = await supabase.from("hosted_agents").update({ name: agent.name, description: agent.description, template_id: agent.template_id }).eq("agent_nft_id", agent.agent_nft_id);
    console.log(error ? `  hosted FAIL: ${error.message}` : `  hosted UPDATED`);
  }
}

console.log("\nDone!");
