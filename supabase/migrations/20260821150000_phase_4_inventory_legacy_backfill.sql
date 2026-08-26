-- Preserve the legacy catalog quantity when Phase 4A is introduced.
-- Phase 3 payloads used availableQuantity; this correction keeps that value
-- in the authoritative ledger without mutating the append-only initial row.

alter table inventory.stock_movements
  add column if not exists request_fingerprint text;

with candidates as (
  select
    balance.variant_id,
    balance.product_id,
    balance.on_hand as previous_on_hand,
    greatest(
      0,
      coalesce(
        nullif(variant.payload ->> 'stock', '')::integer,
        nullif(variant.payload ->> 'availableQuantity', '')::integer,
        0
      )
    ) as legacy_on_hand
  from inventory.stock_balances balance
  join catalog.product_variants variant on variant.id = balance.variant_id
  where balance.on_hand = 0
    and coalesce(nullif(variant.payload ->> 'stock', '')::integer, 0) = 0
    and coalesce(nullif(variant.payload ->> 'availableQuantity', '')::integer, 0) > 0
), inserted as (
  insert into inventory.stock_movements (
    variant_id, product_id, movement_type, quantity, on_hand_delta,
    reserved_delta, previous_on_hand, resulting_on_hand, previous_reserved,
    resulting_reserved, reason, operation_key
  )
  select
    candidate.variant_id,
    candidate.product_id,
    'correction',
    candidate.legacy_on_hand,
    candidate.legacy_on_hand,
    0,
    candidate.previous_on_hand,
    candidate.legacy_on_hand,
    0,
    0,
    'legacy_backfill',
    'legacy-backfill:' || candidate.variant_id
  from candidates candidate
  on conflict (operation_key) do nothing
  returning variant_id, resulting_on_hand
)
update inventory.stock_balances balance
set on_hand = inserted.resulting_on_hand,
    availability = case
      when variant.payload ->> 'availability' = 'made_to_order' then 'made_to_order'
      when inserted.resulting_on_hand <= 0 then 'out_of_stock'
      when inserted.resulting_on_hand <= balance.low_stock_threshold then 'low_stock'
      else 'in_stock'
    end
from inserted
join catalog.product_variants variant on variant.id = inserted.variant_id
where balance.variant_id = inserted.variant_id;

update catalog.product_variants variant
set payload = jsonb_set(
  jsonb_set(
    jsonb_set(
      variant.payload,
      '{stock}',
      to_jsonb(balance.on_hand),
      true
    ),
    '{availableQuantity}',
    to_jsonb(balance.on_hand),
    true
  ),
  '{availability}',
  to_jsonb(balance.availability),
  true
)
from inventory.stock_balances balance
where balance.variant_id = variant.id
  and exists (
    select 1
    from inventory.stock_movements movement
    where movement.variant_id = variant.id
      and movement.operation_key = 'legacy-backfill:' || variant.id
  );
