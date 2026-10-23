CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  request_id TEXT NOT NULL REFERENCES requests(id),
  estimate_id TEXT REFERENCES estimates(id),
  estimate_version_id TEXT REFERENCES estimate_versions(id),
  client_id TEXT REFERENCES clients(id),
  property_id TEXT REFERENCES properties(id),
  client_type TEXT NOT NULL CHECK (client_type IN ('direct', 'property_manager')),
  recipient_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  tenant_name TEXT,
  tenant_phone TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  subdivision TEXT,
  postal_code TEXT,
  description TEXT NOT NULL,
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('fixed', 'time_materials')),
  agreed_amount_minor INTEGER NOT NULL CHECK (agreed_amount_minor >= 0),
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  access_instructions TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_orders_workspace_status
  ON work_orders(workspace_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_work_orders_workspace_request
  ON work_orders(workspace_id, request_id);
