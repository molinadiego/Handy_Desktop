PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT,
  subdivision TEXT,
  currency_code TEXT,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO workspaces (id, name, timezone, created_at)
VALUES ('local-workspace', 'Mi negocio', 'UTC', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  type TEXT NOT NULL CHECK (type IN ('direct', 'property_manager')),
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_workspace_name
  ON clients(workspace_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  subdivision TEXT,
  postal_code TEXT,
  country_code TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_workspace_address
  ON properties(workspace_id, address_line1 COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS property_client_history (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('owner', 'manager')),
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_property_client_history_current
  ON property_client_history(workspace_id, property_id, valid_to);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  client_id TEXT REFERENCES clients(id),
  property_id TEXT REFERENCES properties(id),
  client_type TEXT NOT NULL CHECK (client_type IN ('direct', 'property_manager')),
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
  preferred_at TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'quoted', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_workspace_created
  ON requests(workspace_id, created_at DESC);
