CREATE TABLE work_order_extras (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3 AND currency_code GLOB '[A-Z][A-Z][A-Z]'),
  status TEXT NOT NULL CHECK (status IN ('pending_approval', 'approved', 'cancelled')),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approval_method TEXT CHECK (approval_method IS NULL OR approval_method IN ('verbal', 'message', 'written', 'other')),
  approval_note TEXT CHECK (approval_note IS NULL OR length(approval_note) <= 500),
  cancelled_at TEXT,
  CHECK ((status = 'pending_approval' AND approved_at IS NULL AND approval_method IS NULL AND cancelled_at IS NULL)
      OR (status = 'approved' AND approved_at IS NOT NULL AND approval_method IS NOT NULL AND cancelled_at IS NULL)
      OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND approved_at IS NULL AND approval_method IS NULL))
);

CREATE INDEX idx_work_order_extras_order ON work_order_extras(workspace_id, work_order_id, created_at);
