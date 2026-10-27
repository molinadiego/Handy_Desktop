CREATE TABLE employees (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color TEXT NOT NULL CHECK (color IN ('#4f46e5', '#0891b2', '#059669', '#d97706', '#e11d48', '#7c3aed', '#475569', '#65a30d')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, id)
);

CREATE TABLE work_order_assignments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, work_order_id, employee_id),
  FOREIGN KEY (workspace_id, work_order_id) REFERENCES work_orders(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

CREATE INDEX idx_work_order_assignments_employee ON work_order_assignments(workspace_id, employee_id, work_order_id);
