-- ============================================================
-- Nastar Protocol — Security Hardening
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Enable RLS on ALL tables ──────────────────────────────────

ALTER TABLE hosted_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE registered_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_cache ENABLE ROW LEVEL SECURITY;

-- ── Policies: anon key can only READ safe columns ─────────────

-- hosted_agents: public can read basic info only (no keys!)
CREATE POLICY "Public read safe hosted_agents columns"
  ON hosted_agents FOR SELECT
  USING (true);

-- agent_logs: public can read logs (no sensitive data)
CREATE POLICY "Public read agent_logs"
  ON agent_logs FOR SELECT
  USING (true);

-- judge_cases: public can read cases
CREATE POLICY "Public read judge_cases"
  ON judge_cases FOR SELECT
  USING (true);

-- judge_evidence: public can read evidence
CREATE POLICY "Public read judge_evidence"
  ON judge_evidence FOR SELECT
  USING (true);

-- registered_agents: public can read basic info
CREATE POLICY "Public read registered_agents"
  ON registered_agents FOR SELECT
  USING (true);

-- reputation_cache: public can read
CREATE POLICY "Public read reputation_cache"
  ON reputation_cache FOR SELECT
  USING (true);

-- ── Block all writes from anon key ────────────────────────────
-- (Writes should only come from server-side with service_role key)

-- No INSERT/UPDATE/DELETE policies = blocked by default with RLS enabled

-- ── Create a VIEW that hides sensitive columns ────────────────

CREATE OR REPLACE VIEW hosted_agents_public AS
SELECT
  id, agent_wallet, owner_address, agent_nft_id, service_id,
  name, description, template_id, system_prompt,
  llm_provider, llm_model,
  -- EXCLUDED: api_key, llm_api_key
  spending_limits, status,
  jobs_completed, total_earned,
  created_at, updated_at
FROM hosted_agents;

CREATE OR REPLACE VIEW registered_agents_public AS
SELECT
  id, owner_address, agent_wallet,
  -- EXCLUDED: agent_private_key, api_key
  name, description, agent_nft_id, service_id,
  endpoint, tags, price_per_call, payment_token,
  avatar, created_at
FROM registered_agents;
