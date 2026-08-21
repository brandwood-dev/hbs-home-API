-- HBS HOME Phase 4A: authoritative inventory balances and immutable ledger.
-- All stock mutations are performed by the API inside a transaction. The
-- hbs_api role is the only database writer; browser clients never access this
-- private schema directly.

create schema if not exists inventory;

create table inventory.stock_balances (
  variant_id text primary key references catalog.product_variants (id) on delete restrict,
  product_id text not null references catalog.products (id) on delete restrict,
  on_hand integer not null default 0,
  reserved integer not null default 0,
  low_stock_threshold integer not null default 3,
  track_inventory boolean not null default true,
  availability text not null default 'out_of_stock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_stock_balances_on_hand_non_negative check (on_hand >= 0),
  constraint inventory_stock_balances_reserved_non_negative check (reserved >= 0),
  constraint inventory_stock_balances_reserved_within_hand check (reserved <= on_hand),
  constraint inventory_stock_balances_threshold_non_negative check (low_stock_threshold >= 0),
  constraint inventory_stock_balances_availability check (
    availability in ('in_stock', 'low_stock', 'out_of_stock', 'made_to_order')
  )
);

create index inventory_stock_balances_product_idx
  on inventory.stock_balances (product_id, variant_id);
create index inventory_stock_balances_availability_idx
  on inventory.stock_balances (availability, updated_at desc, variant_id);

create table inventory.stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references catalog.product_variants (id) on delete restrict,
  product_id text not null references catalog.products (id) on delete restrict,
  movement_type text not null,
  quantity integer not null,
  on_hand_delta integer not null default 0,
  reserved_delta integer not null default 0,
  previous_on_hand integer not null,
  resulting_on_hand integer not null,
  previous_reserved integer not null,
  resulting_reserved integer not null,
  reason text not null,
  note text,
  operation_key text not null,
  request_fingerprint text,
  order_id text,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint inventory_stock_movements_type check (
    movement_type in (
      'initial', 'adjustment_in', 'adjustment_out', 'reservation',
      'reservation_release', 'sale', 'return', 'damage', 'correction'
    )
  ),
  constraint inventory_stock_movements_quantity_positive check (quantity > 0),
  constraint inventory_stock_movements_result_on_hand_non_negative check (resulting_on_hand >= 0),
  constraint inventory_stock_movements_result_reserved_non_negative check (resulting_reserved >= 0),
  constraint inventory_stock_movements_operation_key_length check (
    char_length(btrim(operation_key)) between 1 and 160
  ),
  constraint inventory_stock_movements_reason_length check (
    char_length(btrim(reason)) between 1 and 80
  )
);

create unique index inventory_stock_movements_operation_key_unique
  on inventory.stock_movements (operation_key);
create index inventory_stock_movements_variant_idx
  on inventory.stock_movements (variant_id, created_at desc, id desc);
create index inventory_stock_movements_product_idx
  on inventory.stock_movements (product_id, created_at desc, id desc);

create or replace function inventory.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function inventory.set_updated_at() from public;

create trigger stock_balances_set_updated_at
before update on inventory.stock_balances
for each row execute function inventory.set_updated_at();

create or replace function inventory.prevent_movement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Inventory movements are immutable.' using errcode = '55000';
end;
$$;

revoke all on function inventory.prevent_movement_mutation() from public;

create trigger stock_movements_immutable
before update or delete on inventory.stock_movements
for each row execute function inventory.prevent_movement_mutation();

-- New variants receive an initial balance and an initial ledger entry. This
-- keeps product creation safe even when the Admin product form creates the
-- variant before the dedicated Stock screen is used.
create or replace function inventory.ensure_stock_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  initial_stock integer := greatest(
    0,
    coalesce(
      nullif(new.payload ->> 'stock', '')::integer,
      nullif(new.payload ->> 'availableQuantity', '')::integer,
      0
    )
  );
  threshold integer := greatest(0, coalesce((new.payload ->> 'lowStockThreshold')::integer, 3));
  tracking boolean := coalesce((new.payload ->> 'trackInventory')::boolean, true);
  initial_availability text := coalesce(new.payload ->> 'availability', '');
begin
  if initial_availability not in ('in_stock', 'low_stock', 'out_of_stock', 'made_to_order') then
    initial_availability := case
      when initial_stock = 0 then 'out_of_stock'
      when initial_stock <= threshold then 'low_stock'
      else 'in_stock'
    end;
  end if;

  insert into inventory.stock_balances (
    variant_id, product_id, on_hand, reserved, low_stock_threshold,
    track_inventory, availability
  ) values (
    new.id, new.product_id, initial_stock, 0, threshold,
    tracking, initial_availability
  ) on conflict (variant_id) do nothing;

  insert into inventory.stock_movements (
    variant_id, product_id, movement_type, quantity, on_hand_delta,
    reserved_delta, previous_on_hand, resulting_on_hand, previous_reserved,
    resulting_reserved, reason, operation_key
  ) values (
    new.id, new.product_id, 'initial', greatest(initial_stock, 1), initial_stock,
    0, 0, initial_stock, 0, 0, 'initial', 'initial:' || new.id
  ) on conflict (operation_key) do nothing;

  return new;
end;
$$;

revoke all on function inventory.ensure_stock_balance() from public;

create trigger product_variants_ensure_stock_balance
after insert on catalog.product_variants
for each row execute function inventory.ensure_stock_balance();

with legacy_source as (
  select
    variant.*,
    greatest(
      0,
      coalesce(
        nullif(variant.payload ->> 'stock', '')::integer,
        nullif(variant.payload ->> 'availableQuantity', '')::integer,
        0
      )
    ) as initial_stock
  from catalog.product_variants variant
)
insert into inventory.stock_balances (
  variant_id, product_id, on_hand, reserved, low_stock_threshold,
  track_inventory, availability
)
select
  variant.id,
  variant.product_id,
  variant.initial_stock,
  0,
  greatest(0, coalesce(nullif((variant.payload ->> 'lowStockThreshold'), '')::integer, 3)),
  coalesce((variant.payload ->> 'trackInventory')::boolean, true),
  case
    when variant.payload ->> 'availability' = 'made_to_order' then 'made_to_order'
    when variant.initial_stock = 0 then 'out_of_stock'
    when variant.initial_stock <= greatest(0, coalesce(nullif(variant.payload ->> 'lowStockThreshold', '')::integer, 3)) then 'low_stock'
    else 'in_stock'
  end
from legacy_source variant
on conflict (variant_id) do nothing;

insert into inventory.stock_movements (
  variant_id, product_id, movement_type, quantity, on_hand_delta,
  reserved_delta, previous_on_hand, resulting_on_hand, previous_reserved,
  resulting_reserved, reason, operation_key
)
select
  balance.variant_id,
  balance.product_id,
  'initial',
  greatest(balance.on_hand, 1),
  balance.on_hand,
  0,
  0,
  balance.on_hand,
  0,
  0,
  'initial',
  'initial:' || balance.variant_id
from inventory.stock_balances balance
on conflict (operation_key) do nothing;

alter table inventory.stock_balances enable row level security;
alter table inventory.stock_movements enable row level security;

create policy stock_balances_api_all on inventory.stock_balances
  for all to hbs_api using (true) with check (true);
create policy stock_movements_api_all on inventory.stock_movements
  for all to hbs_api using (true) with check (true);

grant select, insert, update on inventory.stock_balances to hbs_api;
grant select, insert on inventory.stock_movements to hbs_api;
grant usage on schema inventory to hbs_api;

comment on schema inventory is
  'Private authoritative stock balances and immutable movements; accessed only by the HBS HOME API.';
comment on table inventory.stock_balances is
  'Current on-hand/reserved quantities per product variant. Mutations must be accompanied by a ledger movement.';
comment on table inventory.stock_movements is
  'Append-only stock ledger. Every quantity change is recorded with actor, reason and idempotency key.';
