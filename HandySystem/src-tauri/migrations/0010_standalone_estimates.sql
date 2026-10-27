ALTER TABLE estimates
ADD COLUMN client_type TEXT NOT NULL DEFAULT 'direct'
CHECK (client_type IN ('direct', 'property_manager'));

ALTER TABLE estimates ADD COLUMN tenant_name TEXT;
ALTER TABLE estimates ADD COLUMN tenant_phone TEXT;
