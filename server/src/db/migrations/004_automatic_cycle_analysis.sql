ALTER TABLE profiles DROP COLUMN cycle_length, DROP COLUMN period_duration;
UPDATE profiles SET revision=revision+1;
CREATE TABLE cycle_forecasts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anchor_date date NOT NULL,
  expected_start date NOT NULL,
  expected_end date NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,anchor_date),
  CHECK(expected_end>=expected_start)
);
