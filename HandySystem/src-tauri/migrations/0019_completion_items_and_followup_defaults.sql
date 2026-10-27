UPDATE workspaces SET estimate_followup_days = 15 WHERE estimate_followup_days IS NULL;
UPDATE workspaces SET appointment_confirmation_days = 15 WHERE appointment_confirmation_days IS NULL;

CREATE TABLE work_order_completion_items (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, work_order_id, position)
);

CREATE INDEX idx_work_order_completion_items_order
  ON work_order_completion_items(workspace_id, work_order_id, position);
