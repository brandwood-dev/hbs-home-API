-- HBS HOME Phase 9A: complete category/attribute metadata contracts.
--
-- The normalized catalogue tables already exist. This migration adds the
-- fields required by the Admin UI and keeps the existing RLS/role boundary.

alter table catalog.categories
  add column image_url text,
  add column seo_title text,
  add column seo_description text,
  add column show_in_navigation boolean not null default true;

alter table catalog.categories
  add constraint catalog_categories_image_url_length check (
    image_url is null or char_length(image_url) between 1 and 2048
  ),
  add constraint catalog_categories_seo_title_length check (
    seo_title is null or char_length(btrim(seo_title)) between 1 and 160
  ),
  add constraint catalog_categories_seo_description_length check (
    seo_description is null or char_length(btrim(seo_description)) between 1 and 320
  );

alter table catalog.attributes
  add column is_variant_axis boolean not null default false,
  add column sort_order integer not null default 0,
  add column is_system boolean not null default false;

alter table catalog.attributes
  add constraint catalog_attributes_sort_order check (sort_order >= 0);

alter table catalog.attribute_options
  add column hex text,
  add column family text,
  add column is_active boolean not null default true;

alter table catalog.attribute_options
  add constraint catalog_attribute_options_hex_format check (
    hex is null or hex ~ '^#[0-9A-Fa-f]{6}$'
  ),
  add constraint catalog_attribute_options_family_length check (
    family is null or char_length(btrim(family)) between 1 and 80
  );

create index catalog_categories_navigation_idx
  on catalog.categories (show_in_navigation, status, sort_order, id);
create index catalog_attributes_order_idx
  on catalog.attributes (status, sort_order, key);
create index catalog_category_attributes_order_idx
  on catalog.category_attributes (attribute_id, sort_order, category_id);

-- Keep legacy catalogue records usable while making the Admin fields explicit.
update catalog.categories
set seo_title = name
where seo_title is null;

update catalog.categories
set seo_description = left(btrim(description), 320)
where seo_description is null
  and description is not null
  and char_length(btrim(description)) > 0;
