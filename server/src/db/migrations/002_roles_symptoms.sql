ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'em' CHECK (role IN ('anh', 'em'));
UPDATE users SET role='anh' WHERE id IN (SELECT companion_id FROM connections) AND id NOT IN (SELECT owner_id FROM connections);
ALTER TABLE profiles ADD COLUMN symptom_suggestions jsonb NOT NULL DEFAULT '["Đau bụng","Đau lưng","Đau đầu","Căng ngực"]'::jsonb;
