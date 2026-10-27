ALTER TABLE workspaces
ADD COLUMN estimate_followup_days INTEGER
CHECK (estimate_followup_days IS NULL OR estimate_followup_days BETWEEN 1 AND 365);

ALTER TABLE workspaces
ADD COLUMN appointment_confirmation_days INTEGER
CHECK (appointment_confirmation_days IS NULL OR appointment_confirmation_days BETWEEN 1 AND 365);

CREATE TABLE follow_up_task_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  task_type TEXT NOT NULL CHECK (task_type IN ('estimate_follow_up', 'appointment_confirmation')),
  entity_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, task_type, entity_id)
);

CREATE INDEX idx_follow_up_tasks_workspace_due ON follow_up_task_overrides(workspace_id, status, due_at);
