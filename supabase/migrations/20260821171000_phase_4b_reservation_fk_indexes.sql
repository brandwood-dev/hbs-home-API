-- Cover the product foreign key used by reservation reconciliation and
-- preserve efficient reverse lookups without relying on the primary key.
create index inventory_reservation_items_product_idx
  on inventory.reservation_items (product_id, reservation_id);
