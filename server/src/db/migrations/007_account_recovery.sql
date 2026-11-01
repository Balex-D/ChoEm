ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
CREATE TABLE account_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_expiry ON account_tokens(expires_at);
CREATE INDEX account_tokens_user ON account_tokens(user_id,purpose);
