-- HBS HOME Phase 8A: normalized attribute values are searchable as well.

create index if not exists catalog_product_attributes_value_trgm_idx
  on catalog.product_attributes using gin (lower(value::text) extensions.gin_trgm_ops);
