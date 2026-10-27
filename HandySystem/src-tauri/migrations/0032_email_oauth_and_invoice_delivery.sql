ALTER TABLE workspaces ADD COLUMN gmail_oauth_client_id TEXT;
ALTER TABLE workspaces ADD COLUMN microsoft_oauth_client_id TEXT;
ALTER TABLE workspaces ADD COLUMN gmail_connected_email TEXT;
ALTER TABLE workspaces ADD COLUMN microsoft_connected_email TEXT;

CREATE TABLE invoice_email_sends (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'microsoft')),
  recipient_email TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  provider_message_id TEXT
);

CREATE INDEX idx_invoice_email_sends_invoice
  ON invoice_email_sends(workspace_id, invoice_id, sent_at);
