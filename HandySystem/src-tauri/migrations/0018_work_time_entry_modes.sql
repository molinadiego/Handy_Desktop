CREATE TABLE work_time_entries_v18 (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('hourly', 'per_job')),
  started_at TEXT,
  ended_at TEXT,
  work_occurred_at TEXT NOT NULL,
  duration_minutes INTEGER,
  amount_minor INTEGER,
  currency_code TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TEXT NOT NULL,
  CHECK (
    (entry_type = 'hourly' AND started_at IS NOT NULL AND ended_at IS NOT NULL
      AND julianday(ended_at) > julianday(started_at)
      AND duration_minutes BETWEEN 1 AND 1440 AND amount_minor IS NULL AND currency_code IS NULL)
    OR
    (entry_type = 'per_job' AND started_at IS NULL AND ended_at IS NULL AND duration_minutes IS NULL
      AND amount_minor > 0 AND currency_code GLOB '[A-Z][A-Z][A-Z]')
  ),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

INSERT INTO work_time_entries_v18 (
  id, workspace_id, work_order_id, employee_id, entry_type, started_at, ended_at,
  work_occurred_at, duration_minutes, amount_minor, currency_code, note, created_at
)
SELECT id, workspace_id, work_order_id, employee_id, 'hourly', started_at, ended_at,
       started_at, duration_minutes, NULL, NULL, note, created_at
FROM work_time_entries;

DROP TABLE work_time_entries;
ALTER TABLE work_time_entries_v18 RENAME TO work_time_entries;

CREATE INDEX idx_work_time_entries_order ON work_time_entries(workspace_id, work_order_id, work_occurred_at);
CREATE INDEX idx_work_time_entries_employee_time ON work_time_entries(workspace_id, employee_id, started_at, ended_at);
