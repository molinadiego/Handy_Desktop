ALTER TABLE workspaces
ADD COLUMN invoice_tax_rate_basis_points INTEGER NOT NULL DEFAULT 0
CHECK (invoice_tax_rate_basis_points BETWEEN 0 AND 10000);

ALTER TABLE invoices
ADD COLUMN tax_rate_basis_points INTEGER
CHECK (tax_rate_basis_points IS NULL OR tax_rate_basis_points BETWEEN 0 AND 10000);

ALTER TABLE invoices
ADD COLUMN client_type TEXT
CHECK (client_type IS NULL OR client_type IN ('direct', 'property_manager'));

ALTER TABLE invoices ADD COLUMN recipient_email TEXT;
ALTER TABLE invoices ADD COLUMN sent_at TEXT;
