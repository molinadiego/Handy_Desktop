-- Rebuild the connected documents together so optional request links and the
-- new work-order relation can be introduced without dropping existing records.
CREATE TABLE estimates_v6 (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  request_id TEXT REFERENCES requests(id),
  work_order_id TEXT REFERENCES work_orders_v6(id),
  client_id TEXT REFERENCES clients(id),
  property_id TEXT REFERENCES properties(id),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE estimate_versions_v6 (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  estimate_id TEXT NOT NULL REFERENCES estimates_v6(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'expired', 'cancelled')),
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('fixed', 'time_materials')),
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  discount_kind TEXT NOT NULL CHECK (discount_kind IN ('amount', 'percent')),
  discount_value INTEGER NOT NULL CHECK (discount_value >= 0),
  discount_minor INTEGER NOT NULL CHECK (discount_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  currency_code TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  subdivision TEXT,
  postal_code TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  accepted_at TEXT,
  UNIQUE (estimate_id, version_number)
);

CREATE TABLE work_orders_v6 (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  request_id TEXT REFERENCES requests(id),
  estimate_id TEXT REFERENCES estimates_v6(id),
  estimate_version_id TEXT REFERENCES estimate_versions_v6(id),
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
  agreed_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (agreed_amount_minor >= 0),
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'pending_approval', 'accepted', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  access_instructions TEXT,
  lockbox_code TEXT,
  gate_code TEXT,
  scheduled_at TEXT,
  scheduled_end_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO estimates_v6 (id, workspace_id, request_id, work_order_id, client_id, property_id, current_version, created_at, updated_at)
SELECT id, workspace_id, request_id, NULL, client_id, property_id, current_version, created_at, updated_at FROM estimates;

INSERT INTO estimate_versions_v6
SELECT id, workspace_id, estimate_id, version_number,
       CASE status WHEN 'rejected' THEN 'cancelled' ELSE status END,
       billing_mode, description, amount_minor, discount_kind, discount_value, discount_minor, total_minor,
       currency_code, recipient_name, contact_name, contact_phone, address_line1, address_line2,
       city, subdivision, postal_code, created_at, sent_at, accepted_at
FROM estimate_versions;

INSERT INTO work_orders_v6
SELECT id, workspace_id, request_id, estimate_id, estimate_version_id, client_id, property_id, client_type,
       recipient_name, contact_name, contact_phone, tenant_name, tenant_phone, address_line1, address_line2,
       city, subdivision, postal_code, description, billing_mode, agreed_amount_minor, currency_code,
       status, priority, access_instructions, NULL, NULL, scheduled_at, NULL, started_at, completed_at,
       cancelled_at, created_at, updated_at
FROM work_orders;

DROP TABLE work_orders;
DROP TABLE estimate_versions;
DROP TABLE estimates;

ALTER TABLE estimates_v6 RENAME TO estimates;
ALTER TABLE estimate_versions_v6 RENAME TO estimate_versions;
ALTER TABLE work_orders_v6 RENAME TO work_orders;

CREATE INDEX idx_estimates_workspace_created ON estimates(workspace_id, created_at DESC);
CREATE INDEX idx_estimates_workspace_request ON estimates(workspace_id, request_id);
CREATE INDEX idx_estimates_workspace_order ON estimates(workspace_id, work_order_id);
CREATE INDEX idx_estimate_versions_current ON estimate_versions(workspace_id, estimate_id, version_number DESC);
CREATE INDEX idx_work_orders_workspace_status ON work_orders(workspace_id, status, scheduled_at);
CREATE INDEX idx_work_orders_workspace_request ON work_orders(workspace_id, request_id);
CREATE INDEX idx_work_orders_workspace_order ON work_orders(workspace_id, created_at DESC);
