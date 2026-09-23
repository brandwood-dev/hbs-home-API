-- Curtain rods use a narrower accessory schema.  Keep the family-level
-- attributes for other accessories, but remove the legacy fields from the
-- Tringles à rideaux child category so new products cannot submit them.
begin;

with target_category as (
  select id
  from catalog.categories
  where slug = 'accessoires-tringles'
),
removed_attributes as (
  select id
  from catalog.attributes
  where key in ('compatibilities', 'finish', 'diameter_mm')
)
delete from catalog.category_attributes category_attribute
using target_category, removed_attributes
where category_attribute.category_id = target_category.id
  and category_attribute.attribute_id = removed_attributes.id;

with target_category as (
  select id
  from catalog.categories
  where slug = 'accessoires-tringles'
),
removed_attributes as (
  select id
  from catalog.attributes
  where key in ('compatibilities', 'finish', 'diameter_mm')
)
delete from catalog.product_attributes product_attribute
using catalog.products product, target_category, removed_attributes
where product_attribute.product_id = product.id
  and product.category_id = target_category.id
  and product_attribute.attribute_id = removed_attributes.id;

-- Reassert the supported system fields idempotently.  This also repairs a
-- partially provisioned environment without touching the root category.
insert into catalog.category_attributes (category_id, attribute_id, is_required, sort_order)
select target_category.id, attribute.id, attribute.is_required, attribute.sort_order
from catalog.categories target_category
join catalog.attributes attribute
  on attribute.key in (
    'material',
    'installation',
    'accessory_type',
    'min_length_cm',
    'max_length_cm'
  )
where target_category.slug = 'accessoires-tringles'
  and attribute.is_system = true
  and attribute.status <> 'archived'
on conflict (category_id, attribute_id) do update
set is_required = excluded.is_required,
    sort_order = excluded.sort_order;

commit;
