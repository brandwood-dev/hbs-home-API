-- Repair bindings for the current "Rideaux & Voilages" root and keep all
-- active descendants aligned with the textile system attributes.
with recursive category_tree as (
  select
    id,
    parent_id,
    id as root_id
  from catalog.categories
  where parent_id is null
    and status <> 'archived'

  union all

  select
    child.id,
    child.parent_id,
    parent.root_id
  from catalog.categories as child
  join category_tree as parent on parent.id = child.parent_id
  where child.status <> 'archived'
), curtain_roots as (
  select id
  from catalog.categories
  where parent_id is null
    and status <> 'archived'
    and (
      slug in (
        'rideaux',
        'voilages',
        'rideaux-voilages',
        'rideaux-et-voilages'
      )
      or lower(btrim(name)) in (
        'rideaux & voilages',
        'rideaux et voilages'
      )
    )
), desired as (
  select
    tree.id as category_id,
    attribute.id as attribute_id,
    attribute.is_required,
    attribute.sort_order
  from category_tree as tree
  join curtain_roots as root on root.id = tree.root_id
  cross join unnest(array[
    'material',
    'opacity',
    'rooms',
    'large_width',
    'care',
    'installation'
  ]::text[]) as requested(attribute_key)
  join catalog.attributes as attribute
    on attribute.key = requested.attribute_key
   and attribute.is_system
   and attribute.status <> 'archived'
)
insert into catalog.category_attributes (
  category_id,
  attribute_id,
  is_required,
  sort_order
)
select category_id, attribute_id, is_required, sort_order
from desired
on conflict (category_id, attribute_id) do update
set is_required = excluded.is_required,
    sort_order = excluded.sort_order;
