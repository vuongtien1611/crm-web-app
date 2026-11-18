-- Migration: Add start_date and end_date to order_items and orders
-- Description: Allows sales staff to specify service timeframe (start date & end date) when converting lead to order or managing draft order items.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS end_date DATE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS end_date DATE;
