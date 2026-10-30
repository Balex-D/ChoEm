ALTER TABLE profiles ADD COLUMN share_symptoms boolean NOT NULL DEFAULT false;
UPDATE profiles SET share_symptoms=share_notes, revision=revision+1;
ALTER TABLE journal_entries ADD COLUMN shared boolean NOT NULL DEFAULT false;
