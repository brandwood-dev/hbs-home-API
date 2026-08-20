BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(30);

SELECT has_table('catalog', 'categories', 'Admin catalogue categories exist');
SELECT has_table('catalog', 'attributes', 'Admin catalogue attributes exist');
SELECT has_table('catalog', 'attribute_options', 'Attribute options exist');
SELECT has_table('catalog', 'products', 'Products retain the Admin write model');
SELECT has_table('catalog', 'product_categories', 'Product/category assignments exist');
SELECT has_table('catalog', 'category_attributes', 'Category/attribute assignments exist');
SELECT has_table('catalog', 'product_attributes', 'Product attribute values exist');
SELECT has_table('catalog', 'product_variants', 'Admin product variants exist');
SELECT has_table('catalog', 'product_media', 'Admin product media exists');

SELECT has_index('catalog', 'categories', 'catalog_categories_slug_unique', 'Category slugs are unique');
SELECT has_index('catalog', 'attributes', 'catalog_attributes_key_unique', 'Attribute keys are unique');
SELECT has_index('catalog', 'products', 'catalog_products_reference_unique', 'Product references are unique');
SELECT has_index('catalog', 'product_variants', 'catalog_product_variants_sku_unique', 'Variant SKUs are unique');
SELECT has_index('catalog', 'product_media', 'catalog_product_media_storage_path_unique', 'Media paths are unique');
SELECT has_index('catalog', 'product_categories', 'catalog_product_categories_one_primary', 'Products have at most one primary category');
SELECT has_index('catalog', 'product_variants', 'catalog_product_variants_one_default', 'Products have at most one default variant');
SELECT has_index('catalog', 'product_media', 'catalog_product_media_one_primary', 'Products have at most one primary media');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog.categories'::regclass),
  'RLS is enabled on categories'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog.product_variants'::regclass),
  'RLS is enabled on variants'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog.product_media'::regclass),
  'RLS is enabled on media'
);
SELECT ok(has_schema_privilege('hbs_api', 'catalog', 'USAGE'), 'API role can use the private catalogue schema');
SELECT ok(has_table_privilege('hbs_api', 'catalog.products', 'INSERT'), 'API role can write products');
SELECT ok(has_table_privilege('hbs_api', 'catalog.product_variants', 'INSERT'), 'API role can write variants');
SELECT ok(NOT has_schema_privilege('anon', 'catalog', 'USAGE'), 'anon cannot use the private catalogue schema');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'catalog'
      AND tablename = 'categories'
      AND policyname = 'catalog_categories_api_all'
      AND roles = ARRAY['hbs_api']::name[]
  ),
  'Category writes are scoped to hbs_api'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'catalog'
      AND tablename = 'product_variants'
      AND policyname = 'catalog_product_variants_api_all'
      AND roles = ARRAY['hbs_api']::name[]
  ),
  'Variant writes are scoped to hbs_api'
);

SELECT is(
  (SELECT count(*)::integer FROM catalog.categories),
  2,
  'Existing seeded categories are normalized'
);
SELECT is(
  (SELECT count(*)::integer FROM catalog.product_variants),
  2,
  'Existing seeded variants are normalized'
);
SELECT is(
  (SELECT count(*)::integer FROM catalog.product_media),
  2,
  'Existing seeded media are normalized'
);
SELECT ok(
  (SELECT count(*) FROM catalog.products WHERE status = 'active' AND category_id IS NOT NULL) = 2,
  'Published seeded products have an active status and category relation'
);

SELECT * FROM finish();
ROLLBACK;
