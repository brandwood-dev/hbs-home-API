-- Preserve existing cart/order rows as one-panel items while allowing a
-- second line for the same variant with a different panel selection.
begin;

alter table commerce.cart_items
  add column panel_count integer not null default 1;

alter table commerce.cart_items
  drop constraint cart_items_pkey,
  add constraint cart_items_pkey
    primary key (cart_id, variant_id, confection_key, panel_count),
  add constraint commerce_cart_items_panel_count
    check (panel_count between 1 and 3);

alter table commerce.order_items
  add column panel_count integer not null default 1,
  add constraint commerce_order_items_panel_count
    check (panel_count between 1 and 3);

create index commerce_cart_items_product_configuration_idx_v2
  on commerce.cart_items (product_id, variant_id, confection_key, panel_count);

commit;
