-- HBS HOME Phase 6D: mutable pre-shipment order coordinates and return cases.
-- The original customer and shipping-address snapshots remain authoritative for
-- the order; this table keeps the return workflow auditable without overloading
-- the public order state machine.

create table commerce.order_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references commerce.orders (id) on delete restrict,
  status text not null default 'requested',
  reason text not null,
  note text,
  condition_reason text,
  restocked boolean not null default false,
  refund_payment boolean not null default false,
  requested_by uuid not null references auth.users (id) on delete restrict,
  resolved_by uuid references auth.users (id) on delete restrict,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint commerce_order_returns_status check (
    status in ('requested', 'accepted', 'refused')
  ),
  constraint commerce_order_returns_reason_length check (
    char_length(btrim(reason)) between 1 and 500
  ),
  constraint commerce_order_returns_note_length check (
    note is null or char_length(btrim(note)) between 1 and 1_000
  ),
  constraint commerce_order_returns_condition_length check (
    condition_reason is null or char_length(btrim(condition_reason)) between 1 and 500
  ),
  constraint commerce_order_returns_resolution_consistency check (
    (status = 'requested' and resolved_at is null and resolved_by is null)
    or (status in ('accepted', 'refused') and resolved_at is not null and resolved_by is not null)
  ),
  constraint commerce_order_returns_restock_only_accepted check (
    restocked = false or status = 'accepted'
  ),
  constraint commerce_order_returns_refund_only_accepted check (
    refund_payment = false or status = 'accepted'
  )
);

create index commerce_order_returns_order_idx
  on commerce.order_returns (order_id, requested_at desc, id desc);
create unique index commerce_order_returns_one_requested
  on commerce.order_returns (order_id)
  where status = 'requested';

alter table commerce.order_returns enable row level security;

create policy order_returns_api_all on commerce.order_returns
  for all to hbs_api using (true) with check (true);

grant select, insert, update on commerce.order_returns to hbs_api;

comment on table commerce.order_returns is
  'Private Admin return cases. Order status remains delivered while a return is requested or resolved.';
