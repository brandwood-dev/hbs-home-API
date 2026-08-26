-- HBS HOME Phase 4B: transactional stock reservations.
-- Reservations are private API-owned records. A reservation changes only the
-- reserved quantity; the immutable stock ledger remains the audit source.

create table inventory.reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_key text not null,
  order_id text,
  status text not null default 'active',
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  converted_at timestamptz,
  request_fingerprint text not null,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint inventory_reservations_status check (
    status in ('active', 'released', 'expired', 'converted')
  ),
  constraint inventory_reservations_key_length check (
    char_length(btrim(reservation_key)) between 1 and 160
  ),
  constraint inventory_reservations_release_consistency check (
    (status = 'active' and released_at is null and release_reason is null)
    or (status in ('released', 'expired') and released_at is not null and release_reason is not null)
    or (status = 'converted' and converted_at is not null)
  )
);

create unique index inventory_reservations_key_unique
  on inventory.reservations (reservation_key);
create index inventory_reservations_active_expiry_idx
  on inventory.reservations (expires_at, id)
  where status = 'active';
create index inventory_reservations_order_idx
  on inventory.reservations (order_id, created_at desc)
  where order_id is not null;

create table inventory.reservation_items (
  reservation_id uuid not null references inventory.reservations (id) on delete restrict,
  variant_id text not null references catalog.product_variants (id) on delete restrict,
  product_id text not null references catalog.products (id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default now(),
  primary key (reservation_id, variant_id),
  constraint inventory_reservation_items_quantity_positive check (quantity > 0)
);

create index inventory_reservation_items_variant_idx
  on inventory.reservation_items (variant_id, reservation_id);

alter table inventory.reservations enable row level security;
alter table inventory.reservation_items enable row level security;

create policy reservations_api_all on inventory.reservations
  for all to hbs_api using (true) with check (true);
create policy reservation_items_api_all on inventory.reservation_items
  for all to hbs_api using (true) with check (true);

grant select, insert, update on inventory.reservations to hbs_api;
grant select, insert on inventory.reservation_items to hbs_api;

insert into iam.permissions (key, description)
values ('inventory.reserve', 'Créer, libérer et expirer les réservations de stock.')
on conflict (key) do update set description = excluded.description;

insert into iam.role_permissions (role_key, permission_key)
values
  ('super_admin', 'inventory.reserve'),
  ('orders_manager', 'inventory.reserve')
on conflict (role_key, permission_key) do nothing;

comment on table inventory.reservations is
  'Transactional stock reservations. Active rows hold reserved quantities until release, expiry or order conversion.';
comment on table inventory.reservation_items is
  'Variant quantities held by a reservation. Every row is paired with reservation ledger movements.';
