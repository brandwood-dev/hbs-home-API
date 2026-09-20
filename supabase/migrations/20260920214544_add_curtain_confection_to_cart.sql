-- Persist a made-to-order curtain confection without multiplying catalogue
-- variants when the option does not change price or stock.
alter table commerce.cart_items
  add column confection_key text not null default '',
  add column selected_options jsonb not null default '[]'::jsonb;

alter table commerce.cart_items
  drop constraint cart_items_pkey,
  add constraint cart_items_pkey
    primary key (cart_id, variant_id, confection_key),
  add constraint commerce_cart_items_confection_key_length
    check (char_length(confection_key) <= 80),
  add constraint commerce_cart_items_selected_options_array
    check (jsonb_typeof(selected_options) = 'array');

create index commerce_cart_items_product_configuration_idx
  on commerce.cart_items (product_id, variant_id, confection_key);
