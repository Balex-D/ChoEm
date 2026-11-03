ALTER TABLE journal_entries
  ADD COLUMN needs_text text NOT NULL DEFAULT '' CHECK (char_length(needs_text) <= 500);
