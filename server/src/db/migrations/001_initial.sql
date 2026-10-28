CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Em',
  cycle_length integer NOT NULL DEFAULT 28 CHECK (cycle_length BETWEEN 15 AND 90),
  period_duration integer NOT NULL DEFAULT 5 CHECK (period_duration BETWEEN 1 AND 15),
  share_cycle boolean NOT NULL DEFAULT false,
  share_mood boolean NOT NULL DEFAULT false,
  share_notes boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_duration < cycle_length)
);
CREATE TABLE cycles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  PRIMARY KEY (user_id, start_date),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE TABLE journal_entries (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  mood text NOT NULL DEFAULT '',
  symptoms jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, entry_date)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE connection_invites (
  token_hash text PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE connections (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_id <> companion_id)
);
CREATE TABLE rate_limits (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE INDEX rate_limit_expiry ON rate_limits(reset_at);
