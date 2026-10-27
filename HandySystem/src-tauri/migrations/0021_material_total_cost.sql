ALTER TABLE work_order_materials
ADD COLUMN total_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_minor >= 0);

ALTER TABLE work_order_materials
ADD COLUMN unit_price_minor INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_minor >= 0);

UPDATE work_order_materials
SET total_cost_minor = CAST(ROUND(unit_cost_minor * quantity) AS INTEGER);

UPDATE work_order_materials
SET unit_price_minor = unit_cost_minor;
