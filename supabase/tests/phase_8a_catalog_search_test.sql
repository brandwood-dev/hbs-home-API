begin;

select plan(6);

select has_extension('pg_trgm', 'pg_trgm is enabled for catalogue fragments');
select has_index(
  'catalog',
  'products',
  'catalog_products_search_tsvector_idx',
  'Published products have a full-text search index'
);
select has_index(
  'catalog',
  'products',
  'catalog_products_reference_trgm_idx',
  'Published product references have a trigram index'
);
select has_index(
  'catalog',
  'product_variants',
  'catalog_product_variants_sku_trgm_idx',
  'Active variant SKUs have a trigram index'
);
select has_index(
  'catalog',
  'product_attributes',
  'catalog_product_attributes_value_trgm_idx',
  'Normalized product attributes have a trigram index'
);
select ok(
  exists (
    select 1
    from catalog.products
    where is_published
      and to_tsvector(
        'simple'::regconfig,
        coalesce(name, '') || ' ' || coalesce(reference, '') || ' ' ||
        coalesce(slug, '') || ' ' || coalesce(category, '') || ' ' ||
        coalesce(material, '') || ' ' || coalesce(short_description, '') || ' ' ||
        coalesce(long_description, '') || ' ' || coalesce(product::text, '')
      ) @@ websearch_to_tsquery('simple'::regconfig, 'lin')
  ),
  'The seeded catalogue is searchable through the indexed document'
);

select * from finish();
rollback;
