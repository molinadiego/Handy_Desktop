ALTER TABLE local_users ADD COLUMN employee_id TEXT REFERENCES employees(id);
CREATE INDEX idx_local_users_employee ON local_users(workspace_id, employee_id);
