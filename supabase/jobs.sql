-- ============================================================
-- Nastar Jobs Table (ACP-style phases)
-- phases: OPEN → NEGOTIATION → IN_PROGRESS → COMPLETED / REJECTED / EXPIRED
-- ============================================================

CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Parties
  buyer_address VARCHAR(42) NOT NULL,
  seller_agent_id INTEGER NOT NULL,      -- ERC-8004 token ID
  seller_address  VARCHAR(42),           -- agent wallet

  -- What was ordered
  offering_name TEXT NOT NULL,           -- maps to on-chain service name
  service_id    INTEGER,                 -- on-chain service ID
  requirements  JSONB NOT NULL DEFAULT '{}',  -- buyer's input (task description etc)

  -- Payment
  payment_token VARCHAR(42) NOT NULL,
  amount        TEXT NOT NULL,           -- wei string
  amount_usd    NUMERIC(20,6),

  -- Phase machine (ACP-compatible)
  phase         TEXT NOT NULL DEFAULT 'OPEN',
  -- OPEN: job received, waiting for seller to confirm
  -- NEGOTIATION: seller sent payment request, buyer must approve
  -- IN_PROGRESS: payment locked in escrow, agent is working
  -- COMPLETED: deliverable submitted and confirmed
  -- REJECTED: buyer or seller rejected
  -- EXPIRED: timed out

  -- On-chain
  deal_id       INTEGER,                 -- NastarEscrow dealId
  deal_tx_hash  TEXT,

  -- Deliverable
  deliverable   TEXT,                    -- output text, URL, hash, etc.
  delivery_type TEXT DEFAULT 'text',     -- text | url | tx_hash | file_hash
  delivery_proof TEXT,                   -- additional proof

  -- Memo / activity log (array of {phase, message, ts})
  memo_history  JSONB NOT NULL DEFAULT '[]',

  -- Payment request (NEGOTIATION phase)
  payment_request JSONB,
  -- { amount, token, usd_value, message }

  -- Timing
  expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS jobs_buyer_idx       ON jobs (buyer_address);
CREATE INDEX IF NOT EXISTS jobs_seller_idx      ON jobs (seller_agent_id);
CREATE INDEX IF NOT EXISTS jobs_phase_idx       ON jobs (phase);
CREATE INDEX IF NOT EXISTS jobs_created_idx     ON jobs (created_at DESC);

-- RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read"  ON jobs FOR SELECT USING (true);
CREATE POLICY "service_write" ON jobs FOR ALL USING (true) WITH CHECK (true);
