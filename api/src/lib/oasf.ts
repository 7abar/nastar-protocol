/**
 * OASF (Open Agent Standard Framework) Taxonomy Mapping
 *
 * Maps Nastar template IDs to OASF skills, domains, and tags
 * for rich ERC-8004 metadata that shows up on Agentscan.
 *
 * Reference: Loopuman agent (token #17) — the gold standard.
 */

export interface OASFProfile {
  skills: { name: string; id: number }[];
  domains: { name: string; id: number }[];
  tags: string[];
}

/**
 * OASF Skill IDs (from Agentscan taxonomy)
 */
const SKILLS = {
  // Data Engineering
  DATA_LABELING: { name: "data_engineering/data_labeling", id: 602 },
  DATA_COLLECTION: { name: "data_engineering/data_collection", id: 601 },
  DATA_QUALITY: { name: "data_engineering/data_quality_management", id: 604 },

  // NLP
  TEXT_GENERATION: { name: "natural_language_processing/text_generation", id: 301 },
  SUMMARIZATION: { name: "natural_language_processing/summarization", id: 306 },
  TEXT_TRANSLATION: { name: "natural_language_processing/text_translation", id: 305 },
  SENTIMENT_ANALYSIS: { name: "natural_language_processing/sentiment_analysis", id: 303 },

  // Agent Orchestration
  AGENT_COORDINATION: { name: "agent_orchestration/agent_coordination", id: 1004 },
  WORKFLOW_MANAGEMENT: { name: "agent_orchestration/workflow_management", id: 1003 },

  // Advanced Reasoning
  TASK_PLANNING: { name: "advanced_reasoning_planning/task_planning", id: 1001 },
  DECISION_MAKING: { name: "advanced_reasoning_planning/decision_making", id: 1002 },

  // Finance
  TRADING: { name: "finance/trading_execution", id: 801 },
  PORTFOLIO_MANAGEMENT: { name: "finance/portfolio_management", id: 802 },
  RISK_ANALYSIS: { name: "finance/risk_analysis", id: 803 },
  PAYMENT_PROCESSING: { name: "finance/payment_processing", id: 804 },

  // Content
  CONTENT_CREATION: { name: "content_generation/content_creation", id: 501 },
  SOCIAL_MEDIA: { name: "content_generation/social_media_management", id: 502 },

  // Research
  WEB_RESEARCH: { name: "research/web_research", id: 701 },
  DATA_ANALYSIS: { name: "research/data_analysis", id: 702 },
};

/**
 * OASF Domain IDs
 */
const DOMAINS = {
  DATA_SCIENCE: { name: "technology/data_science", id: 1601 },
  AI: { name: "technology/artificial_intelligence", id: 1602 },
  BLOCKCHAIN: { name: "technology/blockchain", id: 1603 },
  BUSINESS_OPS: { name: "finance_and_business/business_operations", id: 1701 },
  FINTECH: { name: "finance_and_business/fintech", id: 1702 },
  DEFI: { name: "finance_and_business/defi", id: 1703 },
  SOCIAL_MEDIA: { name: "media_and_communication/social_media", id: 1801 },
  RESEARCH: { name: "education_and_research/research", id: 1901 },
};

/**
 * Template → OASF mapping
 */
const TEMPLATE_PROFILES: Record<string, OASFProfile> = {
  trading: {
    skills: [
      SKILLS.TRADING,
      SKILLS.PORTFOLIO_MANAGEMENT,
      SKILLS.RISK_ANALYSIS,
      SKILLS.DECISION_MAKING,
      SKILLS.DATA_ANALYSIS,
    ],
    domains: [DOMAINS.DEFI, DOMAINS.FINTECH, DOMAINS.BLOCKCHAIN],
    tags: ["trading", "defi", "celo", "token-swap", "automated-trading", "AI-agents"],
  },
  payments: {
    skills: [
      SKILLS.PAYMENT_PROCESSING,
      SKILLS.TASK_PLANNING,
      SKILLS.WORKFLOW_MANAGEMENT,
    ],
    domains: [DOMAINS.FINTECH, DOMAINS.BUSINESS_OPS, DOMAINS.BLOCKCHAIN],
    tags: ["payments", "stablecoin", "automation", "scheduling", "celo", "AI-agents"],
  },
  social: {
    skills: [
      SKILLS.SOCIAL_MEDIA,
      SKILLS.CONTENT_CREATION,
      SKILLS.TEXT_GENERATION,
      SKILLS.SENTIMENT_ANALYSIS,
    ],
    domains: [DOMAINS.SOCIAL_MEDIA, DOMAINS.AI],
    tags: ["social", "farcaster", "lens", "content-creation", "web3-social", "AI-agents"],
  },
  research: {
    skills: [
      SKILLS.WEB_RESEARCH,
      SKILLS.DATA_ANALYSIS,
      SKILLS.DATA_COLLECTION,
      SKILLS.SUMMARIZATION,
    ],
    domains: [DOMAINS.RESEARCH, DOMAINS.DATA_SCIENCE, DOMAINS.BLOCKCHAIN],
    tags: ["research", "analytics", "governance", "onchain-data", "AI-agents"],
  },
  remittance: {
    skills: [
      SKILLS.PAYMENT_PROCESSING,
      SKILLS.TRADING,
      SKILLS.TASK_PLANNING,
      SKILLS.TEXT_TRANSLATION,
    ],
    domains: [DOMAINS.FINTECH, DOMAINS.BUSINESS_OPS, DOMAINS.BLOCKCHAIN],
    tags: ["remittance", "mento", "cross-border", "stablecoin", "global-south", "AI-agents"],
  },
  "fx-hedge": {
    skills: [
      SKILLS.PORTFOLIO_MANAGEMENT,
      SKILLS.RISK_ANALYSIS,
      SKILLS.TRADING,
      SKILLS.DECISION_MAKING,
      SKILLS.DATA_ANALYSIS,
    ],
    domains: [DOMAINS.FINTECH, DOMAINS.DEFI, DOMAINS.BLOCKCHAIN],
    tags: ["fx", "hedging", "mento", "defi", "treasury", "rebalancing", "AI-agents"],
  },
  "dao-ops": {
    skills: [
      SKILLS.WORKFLOW_MANAGEMENT,
      SKILLS.PAYMENT_PROCESSING,
      SKILLS.DATA_ANALYSIS,
      SKILLS.SUMMARIZATION,
      SKILLS.DECISION_MAKING,
    ],
    domains: [DOMAINS.BUSINESS_OPS, DOMAINS.BLOCKCHAIN, DOMAINS.FINTECH],
    tags: ["dao", "governance", "treasury", "multisig", "grants", "payroll", "AI-agents"],
  },
  "nft-agent": {
    skills: [
      SKILLS.DATA_ANALYSIS,
      SKILLS.WEB_RESEARCH,
      SKILLS.DATA_COLLECTION,
      SKILLS.PORTFOLIO_MANAGEMENT,
    ],
    domains: [DOMAINS.BLOCKCHAIN, DOMAINS.DATA_SCIENCE, DOMAINS.AI],
    tags: ["nft", "analytics", "collections", "celo", "portfolio", "floor-price", "AI-agents"],
  },
  "defi-yield": {
    skills: [
      SKILLS.TRADING,
      SKILLS.PORTFOLIO_MANAGEMENT,
      SKILLS.RISK_ANALYSIS,
      SKILLS.DATA_ANALYSIS,
      SKILLS.DECISION_MAKING,
    ],
    domains: [DOMAINS.DEFI, DOMAINS.FINTECH, DOMAINS.BLOCKCHAIN],
    tags: ["defi", "yield", "farming", "liquidity", "celo", "optimization", "AI-agents"],
  },
  custom: {
    skills: [
      SKILLS.TASK_PLANNING,
      SKILLS.AGENT_COORDINATION,
      SKILLS.TEXT_GENERATION,
    ],
    domains: [DOMAINS.AI, DOMAINS.BLOCKCHAIN],
    tags: ["custom", "AI-agents", "celo"],
  },
};

/**
 * Get OASF profile for a template
 */
export function getOASFProfile(templateId: string): OASFProfile {
  return TEMPLATE_PROFILES[templateId] || TEMPLATE_PROFILES.custom;
}

/**
 * Build full ERC-8004 registration metadata (Loopuman-level)
 */
export function buildAgentMetadata(opts: {
  name: string;
  description: string;
  image?: string;
  externalUrl: string;
  version?: string;
  templateId: string;
  agentNftId: number;
  services?: Array<{
    id: number;
    name: string;
    description: string;
    price: number;
    active: boolean;
  }>;
  apiUrl: string;
  appUrl: string;
  agentWallet?: string;
}) {
  const oasf = getOASFProfile(opts.templateId);

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: opts.name,
    description: opts.description,
    image: opts.image || `${opts.appUrl}/api/agent/${opts.agentNftId}/image`,
    external_url: opts.externalUrl,
    version: opts.version || "1.0.0",
    active: true,
    tags: oasf.tags,

    // Services — MCP, A2A, OASF, web, api, agentWallet
    services: [
      {
        name: "MCP",
        version: "2025-06-18",
        endpoint: `${opts.apiUrl}/.well-known/mcp.json`,
        mcpTools: [
          "browse_agents",
          "get_agent",
          "create_deal",
          "check_deal",
          "get_reputation",
          "list_services",
          "get_balance",
        ],
        mcpPrompts: ["hire_agent", "check_status", "help"],
      },
      {
        name: "A2A",
        version: "0.3.0",
        endpoint: `${opts.apiUrl}/.well-known/agent-card.json`,
        a2aSkills: oasf.skills.map((s) => s.name),
      },
      {
        name: "OASF",
        version: "v0.8.0",
        endpoint: `${opts.apiUrl}/api/agent/${opts.agentNftId}/oasf.json`,
        skills: oasf.skills.map((s) => s.name),
        domains: oasf.domains.map((d) => d.name),
      },
      {
        name: "web",
        endpoint: `${opts.appUrl}/agents/${opts.agentNftId}`,
      },
      {
        name: "api",
        endpoint: `${opts.apiUrl}/v1/services`,
        version: "1.0.0",
      },
      {
        name: "agentWallet",
        endpoint: `eip155:42220:${opts.agentWallet || "0x0000000000000000000000000000000000000000"}`,
      },
    ],

    // OASF taxonomy
    skills: oasf.skills,
    domains: oasf.domains,

    // Publisher
    publisher: {
      name: "Nastar Protocol",
      website: "https://nastar.fun",
      twitter: "https://x.com/naaborprotocol",
      github: "https://github.com/7abar/nastar-protocol",
    },

    // Trust mechanisms
    supportedTrust: ["reputation", "crypto-economic"],
    x402Support: true,

    // ERC-8004 registration reference
    registrations: [
      {
        agentId: opts.agentNftId,
        agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      },
    ],
  };
}
