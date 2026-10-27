CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  reference_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'voided')),
  recipient_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  description TEXT NOT NULL,
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor > 0),
  tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor = subtotal_minor + tax_minor),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3 AND currency_code GLOB '[A-Z][A-Z][A-Z]'),
  created_at TEXT NOT NULL,
  issued_at TEXT,
  voided_at TEXT,
  void_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (workspace_id, reference_code),
  CHECK ((status = 'draft' AND issued_at IS NULL AND voided_at IS NULL AND void_reason IS NULL)
      OR (status = 'issued' AND issued_at IS NOT NULL AND voided_at IS NULL AND void_reason IS NULL)
      OR (status = 'voided' AND issued_at IS NOT NULL AND voided_at IS NOT NULL AND length(trim(void_reason)) > 0))
);

CREATE UNIQUE INDEX idx_invoice_open_per_order
  ON invoices(workspace_id, work_order_id) WHERE status IN ('draft', 'issued');
CREATE INDEX idx_invoices_workspace_status ON invoices(workspace_id, status, created_at);

CREATE TABLE customer_payments (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  paid_at TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (length(currency_code) = 3 AND currency_code GLOB '[A-Z][A-Z][A-Z]'),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_customer_payments_workspace_date ON customer_payments(workspace_id, paid_at);

CREATE TABLE invoice_payment_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  payment_id TEXT NOT NULL REFERENCES customer_payments(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'reversed')),
  created_at TEXT NOT NULL,
  reversed_at TEXT,
  reversal_reason TEXT,
  CHECK ((status = 'active' AND reversed_at IS NULL AND reversal_reason IS NULL)
      OR (status = 'reversed' AND reversed_at IS NOT NULL AND length(trim(reversal_reason)) > 0))
);
CREATE INDEX idx_invoice_allocations_invoice ON invoice_payment_allocations(workspace_id, invoice_id, status);
CREATE INDEX idx_invoice_allocations_payment ON invoice_payment_allocations(workspace_id, payment_id, status);
