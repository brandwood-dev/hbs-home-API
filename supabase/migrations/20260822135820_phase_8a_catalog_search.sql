-- HBS HOME Phase 8A: API-backed catalogue search.
--
-- Search is deliberately kept in the existing catalogue read model. The
-- generated tsvector covers the public product fields and JSONB attributes;
-- trigram indexes keep short reference/name fragments responsive. Variant
-- SKUs are indexed separately because variants are normalized write data.

create extension if not exists pg_trgm with schema extensions;

create index if not exists catalog_products_search_tsvector_idx
  on catalog.products using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(name, '') || ' ' ||
      coalesce(reference, '') || ' ' ||
      coalesce(slug, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(material, '') || ' ' ||
      coalesce(short_description, '') || ' ' ||
      coalesce(long_description, '') || ' ' ||
      coalesce(product::text, '')
    )
  )
  where is_published;

create index if not exists catalog_products_name_trgm_idx
  on catalog.products using gin (lower(name) extensions.gin_trgm_ops)
  where is_published;

create index if not exists catalog_products_reference_trgm_idx
  on catalog.products using gin (lower(reference) extensions.gin_trgm_ops)
  where is_published;

create index if not exists catalog_products_slug_trgm_idx
  on catalog.products using gin (lower(slug) extensions.gin_trgm_ops)
  where is_published;

create index if not exists catalog_product_variants_sku_trgm_idx
  on catalog.product_variants using gin (lower(sku) extensions.gin_trgm_ops)
  where status = 'active';
