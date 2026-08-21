-- Keep the denormalized public product payload coherent with authoritative
-- inventory balances. Public catalog reads are intentionally fast and read
-- catalog.products.product, while stock mutations update both representations.

update catalog.products product
set product = jsonb_set(
  product.product,
  '{variants}',
  coalesce(
    (
      select jsonb_agg(
        case
          when balance.variant_id is null then entry.value
          else entry.value || jsonb_build_object(
            'stock', balance.on_hand,
            'availableQuantity', greatest(0, balance.on_hand - balance.reserved),
            'availability', balance.availability,
            'lowStockThreshold', balance.low_stock_threshold,
            'trackInventory', balance.track_inventory
          )
        end
        order by entry.ordinality
      )
      from jsonb_array_elements(
        case
          when jsonb_typeof(product.product -> 'variants') = 'array'
            then product.product -> 'variants'
          else '[]'::jsonb
        end
      ) with ordinality as entry(value, ordinality)
      left join inventory.stock_balances balance
        on balance.variant_id = entry.value ->> 'id'
    ),
    '[]'::jsonb
  ),
  true
)
where jsonb_typeof(product.product -> 'variants') = 'array';
