-- Supports the Admin dashboard date range without scanning the full order table.
create index if not exists commerce_orders_created_at_idx
  on commerce.orders (created_at desc);
