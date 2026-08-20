-- HBS HOME Phase 3B: catalogue read foundation.
--
-- The API consumes a deliberately private read model. Product payloads stay in
-- JSONB for compatibility with the existing domain contract while the scalar
-- columns below keep the high-cardinality filters and publication checks
-- indexable. Normalised write tables (variants, media, attributes and stock)
-- will be introduced only when their mutation workflows are implemented.

create schema if not exists catalog authorization postgres;

revoke all on schema catalog from public, anon, authenticated;
grant usage on schema catalog to hbs_api;

create table catalog.products (
  id text primary key,
  slug text not null,
  is_published boolean not null default false,
  is_demo boolean not null default false,
  category text not null,
  material text not null,
  opacity_level text,
  selling_mode text not null,
  pattern text,
  blind_type text,
  is_large_width boolean not null default false,
  is_new boolean not null default false,
  is_best_seller boolean not null default false,
  is_featured boolean not null default false,
  is_thermal boolean not null default false,
  recommendation_score numeric(12, 3) not null default 0,
  product jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_products_id_format check (
    id = btrim(id) and char_length(id) between 1 and 160
  ),
  constraint catalog_products_slug_format check (
    slug = lower(btrim(slug))
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 160
  ),
  constraint catalog_products_taxonomy_values check (
    category = btrim(category)
    and char_length(category) between 2 and 120
    and material = btrim(material)
    and char_length(material) between 2 and 120
    and selling_mode = btrim(selling_mode)
    and char_length(selling_mode) between 2 and 64
  ),
  constraint catalog_products_score_non_negative check (
    recommendation_score >= 0
  ),
  constraint catalog_products_payload_object check (
    jsonb_typeof(product) = 'object'
  )
);

create unique index catalog_products_slug_unique
  on catalog.products (slug);

create index catalog_products_published_recommended_idx
  on catalog.products (recommendation_score desc, created_at desc, id)
  where is_published;

create index catalog_products_published_category_idx
  on catalog.products (category, recommendation_score desc, id)
  where is_published;

create index catalog_products_published_material_idx
  on catalog.products (material, recommendation_score desc, id)
  where is_published;

create index catalog_products_published_filter_flags_idx
  on catalog.products (is_new, is_best_seller, is_thermal, is_large_width)
  where is_published;

create index catalog_products_product_gin_idx
  on catalog.products using gin (product jsonb_path_ops)
  where is_published;

create function catalog.set_updated_at()
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

create trigger catalog_products_set_updated_at
before update on catalog.products
for each row execute function catalog.set_updated_at();

alter table catalog.products enable row level security;

-- The application role can only see published products. No Supabase Data API
-- role receives schema/table privileges, so this private table cannot be read
-- directly from a browser even if a client key is leaked.
create policy catalog_products_api_select on catalog.products
  for select to hbs_api
  using (is_published = true);

grant select on catalog.products to hbs_api;

comment on schema catalog is
  'Private HBS HOME catalogue read model; access only through the API role.';
comment on table catalog.products is
  'Published product read model. JSONB preserves the frontend contract; scalar columns support indexed filters.';
