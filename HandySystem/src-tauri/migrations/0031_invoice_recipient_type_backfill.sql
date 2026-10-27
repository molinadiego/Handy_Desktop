-- Recover legacy invoice type only where the current work-order recipient
-- still matches the immutable invoice recipient snapshot.
UPDATE invoices
SET client_type = (
  SELECT w.client_type FROM work_orders w
  WHERE w.id = invoices.work_order_id
    AND w.workspace_id = invoices.workspace_id
    AND w.recipient_name = invoices.recipient_name
)
WHERE client_type IS NULL
  AND EXISTS (
    SELECT 1 FROM work_orders w
    WHERE w.id = invoices.work_order_id
      AND w.workspace_id = invoices.workspace_id
      AND w.recipient_name = invoices.recipient_name
  );
