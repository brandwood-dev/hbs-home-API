-- Remove retired mobilier attribute keys from the denormalized public payload.
-- The cleanup migration may already have run before this payload repair was
-- added, so keep this as a separate idempotent migration.

with recursive mobilier_categories as (
  select id
  from catalog.categories
  where slug in ('mobilier', 'mobilier-interieur')
  union all
  select child.id
  from catalog.categories child
  join mobilier_categories parent on parent.id = child.parent_id
),
legacy_attributes as (
  select key
  from catalog.attributes
  where key in (
    'free_shipping_eligible',
    'depth_cm',
    'seat_width_cm',
    'seat_depth_cm',
    'seat_height_cm',
    'back_height_cm',
    'armrest_height_cm',
    'weight_kg',
    'max_load_kg',
    'package_count'
  )
),
legacy_keys as (
  select coalesce(array_agg(key), array[]::text[]) as keys
  from legacy_attributes
),
mobilier_products as (
  select distinct product.id
  from catalog.products product
  join catalog.product_categories product_category
    on product_category.product_id = product.id
  join mobilier_categories category
    on category.id = product_category.category_id
)
update catalog.products product
set product = jsonb_set(
  coalesce(product.product, '{}'::jsonb),
  '{attributes}',
  coalesce(product.product -> 'attributes', '{}'::jsonb) -
    (select keys from legacy_keys),
  true
)
from mobilier_products mobilier_product
where product.id = mobilier_product.id
  and jsonb_typeof(product.product -> 'attributes') = 'object';
