-- Remove legacy furniture measurements from the mobilier editor contract.
-- The system attribute definitions remain immutable for historical payloads,
-- but no longer bind to mobilier categories or existing mobilier products.

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
  select id
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
)
delete from catalog.category_attributes binding
using mobilier_categories category, legacy_attributes attribute
where binding.category_id = category.id
  and binding.attribute_id = attribute.id;

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
  select id
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
mobilier_products as (
  select distinct product.id
  from catalog.products product
  join catalog.product_categories product_category
    on product_category.product_id = product.id
  join mobilier_categories category
    on category.id = product_category.category_id
)
delete from catalog.product_attributes product_attribute
using mobilier_products product, legacy_attributes attribute
where product_attribute.product_id = product.id
  and product_attribute.attribute_id = attribute.id;

-- Keep the denormalized public payload in sync with the normalized attribute
-- rows removed above.  This prevents retired fields from remaining visible
-- until the product is edited again.
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

-- Material is a required root product field and should also be represented by
-- the normalized system-attribute binding for furniture categories.
with recursive mobilier_categories as (
  select id
  from catalog.categories
  where slug in ('mobilier', 'mobilier-interieur')
  union all
  select child.id
  from catalog.categories child
  join mobilier_categories parent on parent.id = child.parent_id
)
insert into catalog.category_attributes (category_id, attribute_id, is_required, sort_order)
select category.id, attribute.id, true, 10
from mobilier_categories category
join catalog.attributes attribute on attribute.key = 'material'
where attribute.is_system
  and not exists (
    select 1
    from catalog.category_attributes existing
    where existing.category_id = category.id
      and existing.attribute_id = attribute.id
  );
