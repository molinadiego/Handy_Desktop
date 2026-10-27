CREATE TABLE local_users (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  username TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  can_view_access_codes INTEGER NOT NULL DEFAULT 0 CHECK (can_view_access_codes IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, username)
);

CREATE INDEX idx_local_users_workspace ON local_users(workspace_id, username);
