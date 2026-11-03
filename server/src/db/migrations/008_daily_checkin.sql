ALTER TABLE profiles ADD COLUMN sharing_paused boolean NOT NULL DEFAULT false;
ALTER TABLE journal_entries
  ADD COLUMN pain smallint CHECK (pain BETWEEN 0 AND 10),
  ADD COLUMN flow text NOT NULL DEFAULT '' CHECK (flow IN ('','spotting','light','medium','heavy')),
  ADD COLUMN needs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(needs)='array'),
  ADD COLUMN needs_shared boolean NOT NULL DEFAULT false;
