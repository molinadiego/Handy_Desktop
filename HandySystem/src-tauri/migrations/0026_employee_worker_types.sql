ALTER TABLE employees
ADD COLUMN worker_type TEXT NOT NULL DEFAULT 'employee'
CHECK (worker_type IN ('employee', 'helper', 'subcontractor'));
