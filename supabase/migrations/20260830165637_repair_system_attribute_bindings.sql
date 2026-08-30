-- Repair data that was already migrated before the canonical registry became
-- fully authoritative. This migration is idempotent and safe to rerun.

-- The legacy products.material column remains the source of truth for the
-- public product contract. Backfill the normalized required system attribute.
insert into catalog.product_attributes (product_id, attribute_id, value)
select product_row.id,
       material_attribute.id,
       to_jsonb(product_row.material)
from catalog.products as product_row
join catalog.attributes as material_attribute
  on material_attribute.key = 'material'
 and material_attribute.is_system
where nullif(btrim(product_row.material), '') is not null
on conflict (product_id, attribute_id) do update
set value = excluded.value,
    updated_at = now();

-- Apply the same system bindings to existing roots and descendants. The
-- category-creation path applies these rules to future categories as well.
with recursive category_tree as (
  select id, slug, id as root_id, slug as root_slug
  from catalog.categories
  where parent_id is null
    and status <> 'archived'
  union all
  select child.id, child.slug, parent.root_id, parent.root_slug
  from catalog.categories as child
  join category_tree as parent on parent.id = child.parent_id
  where child.status <> 'archived'
), family_attributes(root_slug, attribute_keys) as (
  values
    ('rideaux', array['material', 'opacity', 'rooms', 'large_width', 'care', 'installation']::text[]),
    ('voilages', array['material', 'opacity', 'rooms', 'large_width', 'care', 'installation']::text[]),
    ('stores', array['material', 'opacity', 'rooms', 'care', 'installation', 'blind_type', 'mechanism']::text[]),
    ('coussins', array['material', 'rooms', 'shape', 'removable_cover', 'machine_washable', 'filling', 'closure']::text[]),
    ('galettes-de-chaise', array['material', 'rooms', 'shape', 'removable_cover', 'machine_washable', 'fastening', 'thickness_cm']::text[]),
    ('galettes_de_chaise', array['material', 'rooms', 'shape', 'removable_cover', 'machine_washable', 'fastening', 'thickness_cm']::text[]),
    ('accessoires', array['material', 'installation', 'accessory_type', 'compatibilities', 'finish', 'min_length_cm', 'max_length_cm', 'diameter_mm']::text[]),
    ('mobilier', array['rooms', 'furniture_type', 'removable_cover', 'upholstery', 'frame_material', 'leg_material', 'features', 'seat_comfort', 'number_of_seats', 'assembly_level', 'assembly_time', 'shipping_profile', 'free_shipping_eligible', 'width_cm', 'depth_cm', 'height_cm', 'seat_width_cm', 'seat_depth_cm', 'seat_height_cm', 'back_height_cm', 'armrest_height_cm', 'weight_kg', 'max_load_kg', 'storage_volume_l', 'package_count']::text[]),
    ('mobilier_interieur', array['rooms', 'furniture_type', 'removable_cover', 'upholstery', 'frame_material', 'leg_material', 'features', 'seat_comfort', 'number_of_seats', 'assembly_level', 'assembly_time', 'shipping_profile', 'free_shipping_eligible', 'width_cm', 'depth_cm', 'height_cm', 'seat_width_cm', 'seat_depth_cm', 'seat_height_cm', 'back_height_cm', 'armrest_height_cm', 'weight_kg', 'max_load_kg', 'storage_volume_l', 'package_count']::text[]),
    ('plantes', array['rooms', 'care', 'shipping_profile', 'plant_nature', 'plant_type', 'plant_size', 'common_name', 'botanical_name', 'plant_family', 'origin', 'light_need', 'watering', 'pet_safe', 'toxicity_note', 'flowering', 'trailing', 'pot_included', 'indoor_use', 'preservation', 'fragile']::text[]),
    ('plantes_decoration', array['rooms', 'care', 'shipping_profile', 'plant_nature', 'plant_type', 'plant_size', 'common_name', 'botanical_name', 'plant_family', 'origin', 'light_need', 'watering', 'pet_safe', 'toxicity_note', 'flowering', 'trailing', 'pot_included', 'indoor_use', 'preservation', 'fragile']::text[])
), desired as (
  select tree.id as category_id,
         attribute.id as attribute_id,
         attribute.is_required,
         attribute.sort_order
  from category_tree as tree
  join family_attributes as family on family.root_slug = tree.root_slug
  cross join lateral unnest(family.attribute_keys) as requested(attribute_key)
  join catalog.attributes as attribute
    on attribute.key = requested.attribute_key
   and attribute.is_system
   and attribute.status <> 'archived'
)
insert into catalog.category_attributes (category_id, attribute_id, is_required, sort_order)
select category_id, attribute_id, is_required, sort_order
from desired
on conflict (category_id, attribute_id) do update
set is_required = excluded.is_required,
    sort_order = excluded.sort_order;
