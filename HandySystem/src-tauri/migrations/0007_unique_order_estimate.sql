CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_unique_work_order
  ON estimates(work_order_id) WHERE work_order_id IS NOT NULL;
