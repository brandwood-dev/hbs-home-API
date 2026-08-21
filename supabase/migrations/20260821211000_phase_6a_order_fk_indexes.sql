-- HBS HOME Phase 6A: indexes for order foreign-key lookups.
-- These indexes keep order/cart and order/reservation maintenance queries
-- efficient as the order volume grows.

create index commerce_orders_cart_idx
  on commerce.orders (cart_id);

create index commerce_orders_reservation_idx
  on commerce.orders (reservation_id)
  where reservation_id is not null;
