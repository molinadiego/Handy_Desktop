CREATE TABLE IF NOT EXISTS estimates (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  request_id TEXT NOT NULL REFERENCES requests(id),
  client_id TEXT REFERENCES clients(id),
  property_id TEXT REFERENCES properties(id),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_estimates_workspace_created
  ON estimates(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_estimates_workspace_request
  ON estimates(workspace_id, request_id);

CREATE TABLE IF NOT EXISTS estimate_versions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  estimate_id TEXT NOT NULL REFERENCES estimates(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
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

CREATE INDEX IF NOT EXISTS idx_estimate_versions_current
  ON estimate_versions(workspace_id, estimate_id, version_number DESC);
