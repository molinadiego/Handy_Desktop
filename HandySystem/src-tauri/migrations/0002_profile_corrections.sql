CREATE TABLE IF NOT EXISTS profile_corrections (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('client', 'property')),
  source_id TEXT NOT NULL,
  old_values_json TEXT NOT NULL,
  new_values_json TEXT NOT NULL,
  actor_user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_correction_records (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  correction_id TEXT NOT NULL REFERENCES profile_corrections(id),
  record_type TEXT NOT NULL CHECK (record_type IN ('request')),
  record_id TEXT NOT NULL,
  old_values_json TEXT NOT NULL,
  new_values_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_corrections_source
  ON profile_corrections(workspace_id, source_type, source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_correction_records_group
  ON profile_correction_records(workspace_id, correction_id);
