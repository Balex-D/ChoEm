CREATE TABLE connection_spaces (
  connection_id uuid PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{"nickname":"","likes":"","careNotes":""}'::jsonb,
  anniversary date,
  messages jsonb NOT NULL DEFAULT '{"owner":"","companion":""}'::jsonb,
  plans jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
