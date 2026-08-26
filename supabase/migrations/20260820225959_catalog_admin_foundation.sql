-- HBS HOME Phase 3C.1: Admin-first catalogue write foundation.
--
-- The previous migration exposed a JSONB read model for the public catalogue.
-- This migration adds the normalized write model used by the future Admin API.
-- The JSONB payload remains in place during the expand/contract transition so
-- the current public read routes and staging seed remain backward compatible.

create table catalog.categories (
  id text primary key default gen_random_uuid()::text,
  slug text not null,
  name text not null,
  description text,
  parent_id text references catalog.categories (id) on delete restrict,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_categories_id_format check (
    id = btrim(id) and char_length(id) between 1 and 160
  ),
  constraint catalog_categories_slug_format check (
    slug = lower(btrim(slug))
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 160
  ),
  constraint catalog_categories_name_length check (
    char_length(btrim(name)) between 2 and 160
  ),
  constraint catalog_categories_status check (
    status in ('draft', 'active', 'archived')
  ),
  constraint catalog_categories_sort_order check (sort_order >= 0)
);

create unique index catalog_categories_slug_unique
  on catalog.categories (slug);
create index catalog_categories_parent_idx
  on catalog.categories (parent_id, sort_order, id);
create index catalog_categories_status_idx
  on catalog.categories (status, sort_order, id);

insert into catalog.categories (id, slug, name, status)
select distinct category, category, initcap(replace(category, '_', ' ')), 'active'
from catalog.products
on conflict (slug) do nothing;

create table catalog.attributes (
  id text primary key default gen_random_uuid()::text,
  key text not null,
  name text not null,
  value_type text not null,
  is_filterable boolean not null default false,
  is_required boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_attributes_id_format check (
    id = btrim(id) and char_length(id) between 1 and 160
  ),
  constraint catalog_attributes_key_format check (
    key = lower(btrim(key))
    and key ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint catalog_attributes_name_length check (
    char_length(btrim(name)) between 2 and 160
  ),
  constraint catalog_attributes_value_type check (
    value_type in ('text', 'number', 'boolean', 'select', 'color', 'dimension')
  ),
  constraint catalog_attributes_status check (
    status in ('draft', 'active', 'archived')
  )
);

create unique index catalog_attributes_key_unique
  on catalog.attributes (key);
create index catalog_attributes_status_idx
  on catalog.attributes (status, key);

create table catalog.attribute_options (
  id text primary key default gen_random_uuid()::text,
  attribute_id text not null references catalog.attributes (id) on delete restrict,
  value text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint catalog_attribute_options_id_format check (
    id = btrim(id) and char_length(id) between 1 and 160
  ),
  constraint catalog_attribute_options_value_length check (
    char_length(btrim(value)) between 1 and 160
  ),
  constraint catalog_attribute_options_label_length check (
    char_length(btrim(label)) between 1 and 160
  ),
  constraint catalog_attribute_options_sort_order check (sort_order >= 0)
);

create unique index catalog_attribute_options_value_unique
  on catalog.attribute_options (attribute_id, value);
create index catalog_attribute_options_sort_idx
  on catalog.attribute_options (attribute_id, sort_order, id);

alter table catalog.products
  add column name text,
  add column reference text,
  add column short_description text,
  add column long_description text,
  add column image_alt text,
  add column status text not null default 'draft',
  add column category_id text references catalog.categories (id) on delete restrict,
  add column published_at timestamptz,
  add column archived_at timestamptz,
  add column version bigint not null default 1;

update catalog.products
set name = coalesce(nullif(btrim(product ->> 'name'), ''), 'Produit sans nom'),
    reference = coalesce(nullif(btrim(product ->> 'reference'), ''), id),
    short_description = nullif(btrim(product ->> 'shortDescription'), ''),
    long_description = nullif(btrim(product ->> 'longDescription'), ''),
    image_alt = nullif(btrim(product ->> 'imageAlt'), ''),
    status = case when is_published then 'active' else 'draft' end,
    published_at = case when is_published then coalesce(published_at, now()) end
where name is null or reference is null;

update catalog.products product_row
set category_id = category_row.id
from catalog.categories category_row
where category_row.slug = product_row.category
  and product_row.category_id is null;

alter table catalog.products
  alter column name set not null,
  alter column reference set not null;

alter table catalog.products
  add constraint catalog_products_name_length check (
    char_length(btrim(name)) between 2 and 240
  ),
  add constraint catalog_products_reference_format check (
    reference = btrim(reference)
    and char_length(reference) between 2 and 120
  ),
  add constraint catalog_products_status check (
    status in ('draft', 'active', 'archived')
  ),
  add constraint catalog_products_version_positive check (version > 0);

create unique index catalog_products_reference_unique
  on catalog.products (reference);
create index catalog_products_admin_status_idx
  on catalog.products (status, updated_at desc, id);
create index catalog_products_category_id_idx
  on catalog.products (category_id, status, id);

create table catalog.product_categories (
  product_id text not null references catalog.products (id) on delete restrict,
  category_id text not null references catalog.categories (id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

insert into catalog.product_categories (product_id, category_id, is_primary)
select id, category_id, true
from catalog.products
where category_id is not null
on conflict (product_id, category_id) do nothing;

create unique index catalog_product_categories_one_primary
  on catalog.product_categories (product_id)
  where is_primary;
create index catalog_product_categories_category_idx
  on catalog.product_categories (category_id, product_id);

create table catalog.category_attributes (
  category_id text not null references catalog.categories (id) on delete cascade,
  attribute_id text not null references catalog.attributes (id) on delete restrict,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (category_id, attribute_id),
  constraint catalog_category_attributes_sort_order check (sort_order >= 0)
);

create index catalog_category_attributes_attribute_idx
  on catalog.category_attributes (attribute_id, category_id);

create table catalog.product_attributes (
  product_id text not null references catalog.products (id) on delete restrict,
  attribute_id text not null references catalog.attributes (id) on delete restrict,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, attribute_id),
  constraint catalog_product_attributes_value check (
    jsonb_typeof(value) in ('array', 'boolean', 'number', 'object', 'string')
  )
);

create index catalog_product_attributes_attribute_idx
  on catalog.product_attributes (attribute_id, product_id);
create index catalog_product_attributes_value_gin_idx
  on catalog.product_attributes using gin (value jsonb_path_ops);

create table catalog.product_variants (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references catalog.products (id) on delete restrict,
  sku text not null,
  title text,
  price_amount_minor integer not null,
  compare_at_price_amount_minor integer,
  currency text not null default 'TND',
  status text not null default 'active',
  options jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_product_variants_id_format check (
    id = btrim(id) and char_length(id) between 1 and 160
  ),
  constraint catalog_product_variants_sku_format check (
    sku = btrim(sku)
    and sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$'
  ),
  constraint catalog_product_variants_price_non_negative check (
    price_amount_minor >= 0
  ),
  constraint catalog_product_variants_compare_price check (
    compare_at_price_amount_minor is null
    or compare_at_price_amount_minor >= price_amount_minor
  ),
  constraint catalog_product_variants_currency check (currency = 'TND'),
  constraint catalog_product_variants_status check (
    status in ('draft', 'active', 'archived')
  ),
  constraint catalog_product_variants_options_object check (
    jsonb_typeof(options) = 'object'
  ),
  constraint catalog_product_variants_payload_object check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint catalog_product_variants_sort_order check (sort_order >= 0)
);

create unique index catalog_product_variants_sku_unique
  on catalog.product_variants (sku);
create unique index catalog_product_variants_one_default
  on catalog.product_variants (product_id)
  where is_default;
create index catalog_product_variants_product_idx
  on catalog.product_variants (product_id, status, sort_order, id);

insert into catalog.product_variants (
  id,
  product_id,
  sku,
  price_amount_minor,
  compare_at_price_amount_minor,
  status,
  options,
  payload,
  is_default,
  sort_order
)
select
  variant ->> 'id',
  product_row.id,
  coalesce(nullif(btrim(variant ->> 'sku'), ''), variant ->> 'id'),
  greatest(0, coalesce((variant -> 'price' ->> 'amountMinor')::integer, 0)),
  nullif((variant -> 'compareAtPrice' ->> 'amountMinor')::integer, 0),
  case when product_row.status = 'active' then 'active' else 'draft' end,
  jsonb_build_object(
    'colorId', variant -> 'colorId',
    'widthCm', variant -> 'widthCm',
    'heightCm', variant -> 'heightCm'
  ),
  variant,
  row_number() over (partition by product_row.id order by ordinality) = 1,
  ordinality - 1
from catalog.products product_row
cross join lateral jsonb_array_elements(product_row.product -> 'variants')
  with ordinality as variants(variant, ordinality)
where jsonb_typeof(product_row.product -> 'variants') = 'array'
  and nullif(btrim(variant ->> 'id'), '') is not null
on conflict (id) do update
set product_id = excluded.product_id,
    sku = excluded.sku,
    price_amount_minor = excluded.price_amount_minor,
    compare_at_price_amount_minor = excluded.compare_at_price_amount_minor,
    status = excluded.status,
    options = excluded.options,
    payload = excluded.payload,
    is_default = excluded.is_default,
    sort_order = excluded.sort_order,
    updated_at = now();

create table catalog.product_media (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references catalog.products (id) on delete restrict,
  variant_id text references catalog.product_variants (id) on delete restrict,
  storage_path text not null,
  public_url text,
  alt text not null,
  media_type text not null default 'front',
  status text not null default 'active',
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_product_media_id_format check (
    id = btrim(id) and char_length(id) between 1 and 160
  ),
  constraint catalog_product_media_storage_path_length check (
    char_length(btrim(storage_path)) between 1 and 500
  ),
  constraint catalog_product_media_alt_length check (
    char_length(btrim(alt)) between 1 and 240
  ),
  constraint catalog_product_media_type check (
    media_type in ('front', 'lifestyle', 'fabric_detail', 'header_detail', 'mechanism_detail')
  ),
  constraint catalog_product_media_status check (
    status in ('draft', 'active', 'archived')
  ),
  constraint catalog_product_media_sort_order check (sort_order >= 0)
);

create unique index catalog_product_media_storage_path_unique
  on catalog.product_media (storage_path);
create unique index catalog_product_media_one_primary
  on catalog.product_media (product_id)
  where is_primary;
create index catalog_product_media_product_idx
  on catalog.product_media (product_id, status, sort_order, id);
create index catalog_product_media_variant_idx
  on catalog.product_media (variant_id, sort_order, id)
  where variant_id is not null;

insert into catalog.product_media (
  id,
  product_id,
  storage_path,
  public_url,
  alt,
  media_type,
  status,
  is_primary,
  sort_order
)
select
  image ->> 'id',
  product_row.id,
  image ->> 'url',
  image ->> 'url',
  coalesce(nullif(btrim(image ->> 'alt'), ''), product_row.image_alt),
  case
    when image ->> 'type' in ('front', 'lifestyle', 'fabric_detail', 'header_detail', 'mechanism_detail')
      then image ->> 'type'
    else 'front'
  end,
  case when product_row.status = 'active' then 'active' else 'draft' end,
  row_number() over (partition by product_row.id order by ordinality) = 1,
  ordinality - 1
from catalog.products product_row
cross join lateral jsonb_array_elements(product_row.product -> 'images')
  with ordinality as images(image, ordinality)
where jsonb_typeof(product_row.product -> 'images') = 'array'
  and nullif(btrim(image ->> 'id'), '') is not null
  and nullif(btrim(image ->> 'url'), '') is not null
  and coalesce(nullif(btrim(image ->> 'alt'), ''), product_row.image_alt) is not null
on conflict (id) do update
set product_id = excluded.product_id,
    storage_path = excluded.storage_path,
    public_url = excluded.public_url,
    alt = excluded.alt,
    media_type = excluded.media_type,
    status = excluded.status,
    is_primary = excluded.is_primary,
    sort_order = excluded.sort_order,
    updated_at = now();

create or replace function catalog.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function catalog.set_updated_at() from public;

create trigger catalog_categories_set_updated_at
before update on catalog.categories
for each row execute function catalog.set_updated_at();

create trigger catalog_attributes_set_updated_at
before update on catalog.attributes
for each row execute function catalog.set_updated_at();

create trigger catalog_product_attributes_set_updated_at
before update on catalog.product_attributes
for each row execute function catalog.set_updated_at();

create trigger catalog_product_variants_set_updated_at
before update on catalog.product_variants
for each row execute function catalog.set_updated_at();

create trigger catalog_product_media_set_updated_at
before update on catalog.product_media
for each row execute function catalog.set_updated_at();

alter table catalog.categories enable row level security;
alter table catalog.attributes enable row level security;
alter table catalog.attribute_options enable row level security;
alter table catalog.products enable row level security;
alter table catalog.product_categories enable row level security;
alter table catalog.category_attributes enable row level security;
alter table catalog.product_attributes enable row level security;
alter table catalog.product_variants enable row level security;
alter table catalog.product_media enable row level security;

-- The API is the sole database client for the private catalogue schema. The
-- API performs JWT/RBAC checks and records mutations in audit.events.
create policy catalog_categories_api_all on catalog.categories
  for all to hbs_api using (true) with check (true);
create policy catalog_attributes_api_all on catalog.attributes
  for all to hbs_api using (true) with check (true);
create policy catalog_attribute_options_api_all on catalog.attribute_options
  for all to hbs_api using (true) with check (true);
create policy catalog_products_api_all on catalog.products
  for all to hbs_api using (true) with check (true);
create policy catalog_product_categories_api_all on catalog.product_categories
  for all to hbs_api using (true) with check (true);
create policy catalog_category_attributes_api_all on catalog.category_attributes
  for all to hbs_api using (true) with check (true);
create policy catalog_product_attributes_api_all on catalog.product_attributes
  for all to hbs_api using (true) with check (true);
create policy catalog_product_variants_api_all on catalog.product_variants
  for all to hbs_api using (true) with check (true);
create policy catalog_product_media_api_all on catalog.product_media
  for all to hbs_api using (true) with check (true);

grant select, insert, update, delete on
  catalog.categories,
  catalog.attributes,
  catalog.attribute_options,
  catalog.products,
  catalog.product_categories,
  catalog.category_attributes,
  catalog.product_attributes,
  catalog.product_variants,
  catalog.product_media
to hbs_api;

comment on table catalog.categories is
  'Admin-managed catalogue categories; private and exposed only through the API.';
comment on table catalog.attributes is
  'Typed Admin-managed product attributes and filter metadata.';
comment on table catalog.products is
  'Admin write model during the expand/contract transition; JSONB is retained for the public read contract.';
comment on table catalog.product_variants is
  'Admin-managed purchasable variants with integer TND prices.';
comment on table catalog.product_media is
  'Admin-managed product media metadata referencing Supabase Storage paths.';
