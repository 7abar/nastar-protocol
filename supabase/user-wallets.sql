-- Custodial wallets for users (ACP-style)
-- Each user gets a Nastar Wallet for automated transactions
CREATE TABLE IF NOT EXISTS user_wallets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_address text NOT NULL,           -- Privy wallet address (login identity)
  wallet_address text UNIQUE NOT NULL,   -- Generated custodial wallet
  encrypted_key text NOT NULL,           -- AES-encrypted private key
  agent_nft_id bigint DEFAULT NULL,      -- ERC-8004 identity token ID
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;

-- Only service_role can read (never expose keys to frontend)
CREATE POLICY "user_wallets_service_only" ON user_wallets
  FOR ALL USING (false);

-- Index
CREATE INDEX IF NOT EXISTS user_wallets_owner_idx ON user_wallets(owner_address);
