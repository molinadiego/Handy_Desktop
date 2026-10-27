CREATE TABLE work_time_entries (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TEXT NOT NULL,
  CHECK (julianday(ended_at) > julianday(started_at)),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

CREATE INDEX idx_work_time_entries_order ON work_time_entries(workspace_id, work_order_id, started_at);
CREATE INDEX idx_work_time_entries_employee_time ON work_time_entries(workspace_id, employee_id, started_at, ended_at);
