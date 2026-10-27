CREATE TABLE expenses_v23 (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 150),
  category TEXT NOT NULL CHECK (category IN ('fixed', 'recurring', 'variable', 'travel', 'toll', 'fuel', 'parts', 'other')),
  occurred_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3 AND currency_code GLOB '[A-Z][A-Z][A-Z]'),
  vendor TEXT CHECK (vendor IS NULL OR length(vendor) <= 150),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  receipt_file_name TEXT CHECK (receipt_file_name IS NULL OR length(receipt_file_name) <= 255),
  receipt_mime_type TEXT CHECK (receipt_mime_type IS NULL OR receipt_mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  receipt_size_bytes INTEGER CHECK (receipt_size_bytes IS NULL OR receipt_size_bytes BETWEEN 1 AND 5242880),
  receipt_data_url TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (receipt_file_name IS NULL AND receipt_mime_type IS NULL AND receipt_size_bytes IS NULL AND receipt_data_url IS NULL)
    OR
    (receipt_file_name IS NOT NULL AND receipt_mime_type IS NOT NULL AND receipt_size_bytes IS NOT NULL AND receipt_data_url IS NOT NULL)
  ),
  CHECK (julianday(occurred_at) IS NOT NULL)
);

INSERT INTO expenses_v23 (
  id, workspace_id, work_order_id, description, category, occurred_at, amount_minor,
  currency_code, vendor, note, receipt_file_name, receipt_mime_type, receipt_size_bytes,
  receipt_data_url, created_at
)
SELECT id, workspace_id, work_order_id, description, category, occurred_at, amount_minor,
       currency_code, vendor, note, receipt_file_name, receipt_mime_type, receipt_size_bytes,
       receipt_data_url, created_at
FROM expenses;

DROP TABLE expenses;
ALTER TABLE expenses_v23 RENAME TO expenses;
CREATE INDEX idx_expenses_workspace_date ON expenses(workspace_id, occurred_at);
CREATE INDEX idx_expenses_work_order ON expenses(workspace_id, work_order_id, occurred_at);
