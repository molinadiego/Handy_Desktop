CREATE TABLE employee_payments (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  employee_id TEXT NOT NULL,
  work_order_id TEXT REFERENCES work_orders(id),
  work_time_entry_id TEXT REFERENCES work_time_entries(id),
  paid_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3 AND currency_code GLOB '[A-Z][A-Z][A-Z]'),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TEXT NOT NULL,
  CHECK (work_time_entry_id IS NULL OR work_order_id IS NOT NULL),
  FOREIGN KEY (workspace_id, employee_id) REFERENCES employees(workspace_id, id)
);

CREATE INDEX idx_employee_payments_employee_date ON employee_payments(workspace_id, employee_id, paid_at);
CREATE INDEX idx_employee_payments_order ON employee_payments(workspace_id, work_order_id, paid_at);
CREATE INDEX idx_employee_payments_work_time ON employee_payments(workspace_id, work_time_entry_id);
