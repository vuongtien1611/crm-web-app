-- Migration: Add order_name to orders table and populate existing records
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_name VARCHAR(255);

-- Populate existing orders with meaningful names based on service names, deal names, or company name
UPDATE orders o
SET order_name = COALESCE(
  NULLIF((
    SELECT string_agg(DISTINCT s.name, ', ')
    FROM order_items oi
    JOIN services s ON s.id = oi.service_id
    WHERE oi.order_id = o.id
  ), ''),
  NULLIF((
    SELECT string_agg(DISTINCT d.deal_name, ', ')
    FROM order_items oi
    LEFT JOIN deals d ON d.id = oi.deal_id
    WHERE oi.order_id = o.id
  ), ''),
  'Đơn hàng ' || a.company_name
)
FROM accounts a
WHERE a.id = o.account_id AND (o.order_name IS NULL OR o.order_name = '');
