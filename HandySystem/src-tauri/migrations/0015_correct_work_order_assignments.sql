CREATE TABLE work_order_assignments_v15 (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, work_order_id, employee_id),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

INSERT INTO work_order_assignments_v15 (workspace_id, work_order_id, employee_id, assigned_at)
SELECT a.workspace_id, a.work_order_id, a.employee_id, a.assigned_at
FROM work_order_assignments a
JOIN work_orders w ON w.id = a.work_order_id AND w.workspace_id = a.workspace_id
JOIN employees e ON e.id = a.employee_id AND e.workspace_id = a.workspace_id;

DROP TABLE work_order_assignments;
ALTER TABLE work_order_assignments_v15 RENAME TO work_order_assignments;
CREATE INDEX idx_work_order_assignments_employee ON work_order_assignments(workspace_id, employee_id, work_order_id);
