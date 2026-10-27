CREATE TABLE work_order_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, id)
);

CREATE TABLE work_order_task_assignments (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('assigned', 'completed', 'cancelled', 'reassigned')),
  assigned_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  ended_at TEXT,
  FOREIGN KEY (workspace_id, task_id) REFERENCES work_order_tasks(workspace_id, id),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

CREATE INDEX idx_work_order_tasks_order ON work_order_tasks(workspace_id, work_order_id, active, position);
CREATE INDEX idx_work_order_task_assignments_employee ON work_order_task_assignments(workspace_id, employee_id, status, task_id);
CREATE UNIQUE INDEX idx_active_work_order_task_assignment
  ON work_order_task_assignments(workspace_id, task_id, employee_id) WHERE status = 'assigned';
