ALTER TABLE workspaces
ADD COLUMN language_code TEXT NOT NULL DEFAULT 'es'
CHECK (language_code IN ('en', 'es'));
