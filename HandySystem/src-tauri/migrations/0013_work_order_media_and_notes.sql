CREATE TABLE work_order_photos (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  data_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_work_order_photos_order ON work_order_photos(workspace_id, work_order_id, created_at);

CREATE TABLE work_order_notes (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_work_order_notes_order ON work_order_notes(workspace_id, work_order_id, created_at);
