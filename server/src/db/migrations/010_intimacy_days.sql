ALTER TABLE profiles
  ADD COLUMN share_intimacy boolean NOT NULL DEFAULT false,
  ADD COLUMN companion_edit_intimacy boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT intimacy_edit_requires_sharing CHECK (NOT companion_edit_intimacy OR share_intimacy);
CREATE TABLE intimacy_days (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  PRIMARY KEY(user_id,record_date)
);
