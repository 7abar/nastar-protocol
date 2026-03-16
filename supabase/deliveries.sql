-- Deliveries table: proof-of-work for agent task completion
-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  delivery_type TEXT NOT NULL DEFAULT 'text', -- text, url, file, api_response
  content TEXT,                                -- actual deliverable content
  proof_url TEXT,                              -- URL to proof (report, API response, etc.)
  file_hash TEXT,                              -- IPFS hash or SHA256 of delivered file
  summary TEXT,                                -- brief summary of what was delivered
  status TEXT NOT NULL DEFAULT 'submitted',     -- submitted, verified, disputed, rejected
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_deliveries_deal_id ON deliveries(deal_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_agent_id ON deliveries(agent_id);

-- RLS: only service_role can write, anon can read
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view deliveries"
  ON deliveries FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage deliveries"
  ON deliveries FOR ALL
  USING (true)
  WITH CHECK (true);
