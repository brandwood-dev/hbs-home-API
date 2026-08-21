-- HBS HOME Phase 6A: guest checkout, customers, immutable order snapshots and outbox.
-- Orders are created by the API from the server-side cart. Browser clients never
-- access these tables directly.

create schema if not exists commerce;

create table commerce.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_customers_name_length check (
    char_length(btrim(first_name)) between 2 and 60
    and char_length(btrim(last_name)) between 2 and 60
  ),
  constraint commerce_customers_phone_format check (phone ~ '^\+216[0-9]{8}$'),
  constraint commerce_customers_email_length check (email is null or char_length(email) <= 255)
);

create index commerce_customers_phone_idx on commerce.customers (phone, updated_at desc);
create index commerce_customers_email_idx on commerce.customers (lower(email)) where email is not null;

create table commerce.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_id uuid not null references commerce.customers (id) on delete restrict,
  cart_id uuid not null references commerce.carts (id) on delete restrict,
  status text not null default 'pending_confirmation',
  delivery_method text not null,
  payment_method text not null,
  shipping_address jsonb,
  currency text not null default 'TND',
  subtotal_minor integer not null,
  discount_minor integer not null default 0,
  shipping_minor integer not null default 0,
  total_minor integer not null,
  promo_code text,
  idempotency_key text not null,
  request_fingerprint text not null,
  reservation_id uuid references inventory.reservations (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_orders_number_format check (order_number ~ '^HBS-[0-9]{8}-[A-Z0-9]{6}$'),
  constraint commerce_orders_status check (
    status in ('pending_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')
  ),
  constraint commerce_orders_delivery_method check (delivery_method in ('home_delivery', 'store_pickup')),
  constraint commerce_orders_payment_method check (payment_method = 'cash_on_delivery'),
  constraint commerce_orders_currency check (currency = 'TND'),
  constraint commerce_orders_amounts check (
    subtotal_minor >= 0 and discount_minor between 0 and subtotal_minor
    and shipping_minor >= 0 and total_minor = subtotal_minor - discount_minor + shipping_minor
  ),
  constraint commerce_orders_idempotency_key_length check (char_length(btrim(idempotency_key)) between 1 and 160),
  constraint commerce_orders_fingerprint_length check (char_length(request_fingerprint) = 64)
);

create unique index commerce_orders_number_unique on commerce.orders (order_number);
create unique index commerce_orders_idempotency_unique on commerce.orders (idempotency_key);
create index commerce_orders_customer_created_idx on commerce.orders (customer_id, created_at desc);
create index commerce_orders_status_created_idx on commerce.orders (status, created_at desc);

create table commerce.order_items (
  order_id uuid not null references commerce.orders (id) on delete restrict,
  line_number smallint not null,
  product_id text not null,
  variant_id text not null,
  product_slug text not null,
  product_name text not null,
  product_reference text not null,
  sku text not null,
  image_url text not null,
  image_alt text not null,
  category text not null,
  color_label text,
  width_cm integer,
  height_cm integer,
  curtain_header_label text,
  eyelet_color_label text,
  lining_label text,
  selected_options jsonb not null default '[]'::jsonb,
  selling_unit_label text not null,
  shipping_profile text,
  quantity integer not null,
  unit_price_minor integer not null,
  line_total_minor integer not null,
  created_at timestamptz not null default now(),
  primary key (order_id, line_number),
  constraint commerce_order_items_line_number check (line_number > 0),
  constraint commerce_order_items_quantity check (quantity > 0 and quantity <= 99),
  constraint commerce_order_items_amounts check (unit_price_minor >= 0 and line_total_minor = unit_price_minor * quantity)
);

create index commerce_order_items_product_idx on commerce.order_items (product_id, variant_id);

create table commerce.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce.orders (id) on delete restrict,
  status text not null,
  reason text,
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commerce_order_history_status check (
    status in ('pending_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled')
  )
);

create index commerce_order_history_order_idx on commerce.order_status_history (order_id, created_at asc, id asc);

create table commerce.outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint commerce_outbox_status check (status in ('pending', 'processing', 'processed', 'dead_letter')),
  constraint commerce_outbox_attempts check (attempts >= 0)
);

create unique index commerce_outbox_event_unique
  on commerce.outbox_events (aggregate_type, aggregate_id, event_type);
create index commerce_outbox_pending_idx
  on commerce.outbox_events (available_at, created_at, id)
  where status = 'pending';

create trigger customers_set_updated_at before update on commerce.customers
for each row execute function commerce.set_updated_at();
create trigger orders_set_updated_at before update on commerce.orders
for each row execute function commerce.set_updated_at();

alter table commerce.customers enable row level security;
alter table commerce.orders enable row level security;
alter table commerce.order_items enable row level security;
alter table commerce.order_status_history enable row level security;
alter table commerce.outbox_events enable row level security;

create policy customers_api_all on commerce.customers
  for all to hbs_api using (true) with check (true);
create policy orders_api_all on commerce.orders
  for all to hbs_api using (true) with check (true);
create policy order_items_api_all on commerce.order_items
  for all to hbs_api using (true) with check (true);
create policy order_history_api_all on commerce.order_status_history
  for all to hbs_api using (true) with check (true);
create policy outbox_api_all on commerce.outbox_events
  for all to hbs_api using (true) with check (true);

grant select, insert, update on commerce.customers to hbs_api;
grant select, insert, update on commerce.orders to hbs_api;
grant select, insert on commerce.order_items to hbs_api;
grant select, insert on commerce.order_status_history to hbs_api;
grant select, insert, update on commerce.outbox_events to hbs_api;

comment on table commerce.orders is
  'Server-authoritative guest orders. Prices, promotion and stock are captured at creation time.';
comment on table commerce.order_items is
  'Immutable product snapshots for historical orders; never re-read the live catalog for display.';
comment on table commerce.outbox_events is
  'Transactional event outbox for Brevo notifications and future workers.';
