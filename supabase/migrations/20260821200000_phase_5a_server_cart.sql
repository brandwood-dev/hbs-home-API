-- HBS HOME Phase 5A: server-authoritative guest carts and promotion rules.
-- The browser only receives an opaque cart token. Prices and availability are
-- always re-read from catalog/inventory by the API; adding to a cart does not
-- reserve stock (reservation happens during checkout/order creation).

create schema if not exists commerce;

create table commerce.carts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  auth_user_id uuid,
  status text not null default 'active',
  currency text not null default 'TND',
  promo_code text,
  expires_at timestamptz not null,
  last_accessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_carts_token_hash_format check (
    token_hash = btrim(token_hash) and char_length(token_hash) = 64
  ),
  constraint commerce_carts_status check (status in ('active', 'expired', 'converted')),
  constraint commerce_carts_currency check (currency = 'TND')
);

create unique index commerce_carts_token_hash_unique on commerce.carts (token_hash);
create index commerce_carts_active_expiry_idx
  on commerce.carts (expires_at, id)
  where status = 'active';
create index commerce_carts_auth_user_idx
  on commerce.carts (auth_user_id, updated_at desc)
  where auth_user_id is not null;

create table commerce.cart_items (
  cart_id uuid not null references commerce.carts (id) on delete cascade,
  product_id text not null references catalog.products (id) on delete restrict,
  variant_id text not null references catalog.product_variants (id) on delete restrict,
  quantity integer not null,
  price_at_add_minor integer not null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cart_id, variant_id),
  constraint commerce_cart_items_quantity check (quantity between 1 and 99),
  constraint commerce_cart_items_price_non_negative check (price_at_add_minor >= 0)
);

create index commerce_cart_items_product_idx on commerce.cart_items (product_id, variant_id);

create table commerce.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null,
  discount_value integer not null,
  currency text not null default 'TND',
  min_subtotal_minor integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  redeemed_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_promotions_code_format check (
    code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'
  ),
  constraint commerce_promotions_type check (discount_type in ('percentage', 'fixed_amount')),
  constraint commerce_promotions_value check (
    (discount_type = 'percentage' and discount_value between 1 and 100)
    or (discount_type = 'fixed_amount' and discount_value > 0)
  ),
  constraint commerce_promotions_currency check (currency = 'TND'),
  constraint commerce_promotions_min_subtotal check (min_subtotal_minor >= 0),
  constraint commerce_promotions_redemptions check (
    redeemed_count >= 0 and (max_redemptions is null or max_redemptions > 0)
  ),
  constraint commerce_promotions_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index commerce_promotions_code_unique on commerce.promotions (code);
create index commerce_promotions_active_window_idx
  on commerce.promotions (is_active, starts_at, ends_at, code);

create or replace function commerce.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function commerce.set_updated_at() from public;
create trigger carts_set_updated_at before update on commerce.carts
for each row execute function commerce.set_updated_at();
create trigger cart_items_set_updated_at before update on commerce.cart_items
for each row execute function commerce.set_updated_at();
create trigger promotions_set_updated_at before update on commerce.promotions
for each row execute function commerce.set_updated_at();

alter table commerce.carts enable row level security;
alter table commerce.cart_items enable row level security;
alter table commerce.promotions enable row level security;

create policy carts_api_all on commerce.carts for all to hbs_api using (true) with check (true);
create policy cart_items_api_all on commerce.cart_items for all to hbs_api using (true) with check (true);
create policy promotions_api_read on commerce.promotions for select to hbs_api using (true);
create policy promotions_api_write on commerce.promotions for all to hbs_api using (true) with check (true);

grant usage on schema commerce to hbs_api;
grant select, insert, update on commerce.carts to hbs_api;
grant select, insert, update, delete on commerce.cart_items to hbs_api;
grant select, insert, update, delete on commerce.promotions to hbs_api;

comment on schema commerce is
  'Private API-owned cart and promotion data. Browser clients never access these tables directly.';
comment on table commerce.carts is
  'Opaque-token guest carts. Prices are recalculated from the catalog on every read.';
comment on table commerce.promotions is
  'V1 single-code promotion rules. Redemption counters are consumed by checkout in Phase 6.';
