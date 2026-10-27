CREATE TABLE work_order_materials (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  material_name TEXT NOT NULL CHECK (length(trim(material_name)) BETWEEN 1 AND 150),
  usage_type TEXT NOT NULL CHECK (usage_type IN ('planned', 'used')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_label TEXT NOT NULL CHECK (length(trim(unit_label)) BETWEEN 1 AND 30),
  leftover_quantity REAL NOT NULL DEFAULT 0 CHECK (leftover_quantity >= 0 AND leftover_quantity <= quantity),
  unit_cost_minor INTEGER NOT NULL CHECK (unit_cost_minor >= 0),
  customer_unit_price_minor INTEGER NOT NULL CHECK (customer_unit_price_minor >= 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3 AND currency_code GLOB '[A-Z][A-Z][A-Z]'),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  receipt_file_name TEXT CHECK (receipt_file_name IS NULL OR length(receipt_file_name) <= 255),
  receipt_mime_type TEXT CHECK (receipt_mime_type IS NULL OR receipt_mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  receipt_size_bytes INTEGER CHECK (receipt_size_bytes IS NULL OR receipt_size_bytes BETWEEN 1 AND 5242880),
  receipt_data_url TEXT,
  created_at TEXT NOT NULL,
  CHECK ((usage_type = 'planned' AND leftover_quantity = 0) OR usage_type = 'used'),
  CHECK (
    (receipt_file_name IS NULL AND receipt_mime_type IS NULL AND receipt_size_bytes IS NULL AND receipt_data_url IS NULL)
    OR
    (receipt_file_name IS NOT NULL AND receipt_mime_type IS NOT NULL AND receipt_size_bytes IS NOT NULL AND receipt_data_url IS NOT NULL)
  )
);

CREATE INDEX idx_work_order_materials_order ON work_order_materials(workspace_id, work_order_id, created_at);
