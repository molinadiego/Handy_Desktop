ALTER TABLE work_orders
ADD COLUMN price_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (price_confirmed IN (0, 1));

UPDATE work_orders SET price_confirmed = 1 WHERE agreed_amount_minor > 0;

ALTER TABLE estimate_versions
ADD COLUMN pricing_complete INTEGER NOT NULL DEFAULT 1 CHECK (pricing_complete IN (0, 1));

CREATE TABLE work_order_items (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_work_order_items_order ON work_order_items(workspace_id, work_order_id, position);

CREATE TABLE estimate_version_items (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  estimate_version_id TEXT NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_estimate_version_items_version
  ON estimate_version_items(workspace_id, estimate_version_id, position);

-- Preserve existing single-description records as a first list item.
INSERT INTO work_order_items (id, workspace_id, work_order_id, position, description, created_at)
SELECT lower(hex(randomblob(16))), workspace_id, id, 1, trim(description), created_at
FROM work_orders WHERE length(trim(description)) > 0;

INSERT INTO estimate_version_items (id, workspace_id, estimate_version_id, position, description, created_at)
SELECT lower(hex(randomblob(16))), workspace_id, id, 1, trim(description), created_at
FROM estimate_versions WHERE length(trim(description)) > 0;
