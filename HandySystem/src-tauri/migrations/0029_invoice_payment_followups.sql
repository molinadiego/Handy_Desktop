ALTER TABLE workspaces
ADD COLUMN payment_followup_days INTEGER NOT NULL DEFAULT 15
CHECK (payment_followup_days BETWEEN 1 AND 365);

CREATE TABLE follow_up_task_overrides_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  task_type TEXT NOT NULL CHECK (task_type IN (
    'estimate_follow_up',
    'appointment_confirmation',
    'invoice_payment_follow_up'
  )),
  entity_id TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'dismissed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, task_type, entity_id)
);

INSERT INTO follow_up_task_overrides_v2
  (id, workspace_id, task_type, entity_id, due_at, status, created_at, updated_at)
SELECT id, workspace_id, task_type, entity_id, due_at, status, created_at, updated_at
FROM follow_up_task_overrides;

DROP TABLE follow_up_task_overrides;
ALTER TABLE follow_up_task_overrides_v2 RENAME TO follow_up_task_overrides;

CREATE INDEX idx_follow_up_tasks_workspace_due
  ON follow_up_task_overrides(workspace_id, status, due_at);
