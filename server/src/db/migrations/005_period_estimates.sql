ALTER TABLE profiles ADD COLUMN period_estimates jsonb NOT NULL DEFAULT '{}'::jsonb;
