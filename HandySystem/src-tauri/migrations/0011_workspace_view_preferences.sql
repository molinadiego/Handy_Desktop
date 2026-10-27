ALTER TABLE workspaces
ADD COLUMN clients_view TEXT NOT NULL DEFAULT 'list'
CHECK (clients_view IN ('list', 'cards'));

ALTER TABLE workspaces
ADD COLUMN properties_view TEXT NOT NULL DEFAULT 'cards'
CHECK (properties_view IN ('list', 'cards'));

ALTER TABLE workspaces
ADD COLUMN work_orders_view TEXT NOT NULL DEFAULT 'cards'
CHECK (work_orders_view IN ('list', 'cards'));

ALTER TABLE workspaces
ADD COLUMN estimates_view TEXT NOT NULL DEFAULT 'list'
CHECK (estimates_view IN ('list', 'cards'));
