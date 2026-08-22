-- HBS HOME Phase 6C: operational Admin order mutations.
-- Payment state, shipping confirmation state and private Admin notes remain
-- server-authoritative and are never exposed to anonymous browser clients.

alter table commerce.orders
  add column payment_status text not null default 'pending',
  add column shipping_status text not null default 'calculated';

alter table commerce.orders
  add constraint commerce_orders_payment_status check (
    payment_status in ('pending', 'collected', 'refunded')
  ),
  add constraint commerce_orders_shipping_status check (
    shipping_status in ('calculated', 'to_confirm')
  );

-- Existing bulky/non-standard delivery quotes were created with zero shipping
-- and must remain actionable by Admin after the migration.
update commerce.orders as o
set shipping_status = 'to_confirm'
where o.delivery_method = 'home_delivery'
  and o.shipping_minor = 0
  and exists (
    select 1
    from commerce.order_items as oi
    where oi.order_id = o.id
      and oi.shipping_profile in ('volumineux', 'hors_norme')
  );

create index commerce_orders_payment_status_idx
  on commerce.orders (payment_status, created_at desc);
create index commerce_orders_shipping_status_idx
  on commerce.orders (shipping_status, created_at desc);

create table commerce.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce.orders (id) on delete restrict,
  body text not null,
  author_user_id uuid not null,
  author_name text not null,
  created_at timestamptz not null default now(),
  constraint commerce_order_notes_body_length check (
    char_length(btrim(body)) between 1 and 2_000
  ),
  constraint commerce_order_notes_author_length check (
    char_length(btrim(author_name)) between 1 and 160
  )
);

create index commerce_order_notes_order_idx
  on commerce.order_notes (order_id, created_at desc, id desc);

alter table commerce.order_notes enable row level security;

create policy order_notes_api_all on commerce.order_notes
  for all to hbs_api using (true) with check (true);

grant select, insert on commerce.order_notes to hbs_api;

comment on column commerce.orders.payment_status is
  'Server-authoritative cash-on-delivery collection state.';
comment on column commerce.orders.shipping_status is
  'Whether a non-standard delivery quote still needs Admin confirmation.';
comment on table commerce.order_notes is
  'Private append-only notes written by authenticated Admin users.';
