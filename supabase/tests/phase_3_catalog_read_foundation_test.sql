BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

SELECT has_schema('catalog', 'Private catalogue schema exists');
SELECT has_table('catalog', 'products', 'Catalogue product read model exists');
SELECT is(
  (SELECT count(*)::integer FROM catalog.products),
  2,
  'Deterministic staging seed contains two published products'
);
SELECT has_index(
  'catalog',
  'products',
  'catalog_products_slug_unique',
  'Product slugs are unique'
);
SELECT has_index(
  'catalog',
  'products',
  'catalog_products_published_recommended_idx',
  'Published products have a recommendation index'
);
SELECT has_index(
  'catalog',
  'products',
  'catalog_products_published_category_idx',
  'Published category filtering is indexed'
);
SELECT has_index(
  'catalog',
  'products',
  'catalog_products_product_gin_idx',
  'Published JSONB payloads have a containment index'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog.products'::regclass),
  'RLS is enabled on the catalogue read model'
);
SELECT ok(NOT has_schema_privilege('anon', 'catalog', 'USAGE'), 'anon cannot use catalogue schema');
SELECT ok(
  NOT has_schema_privilege('authenticated', 'catalog', 'USAGE'),
  'authenticated users cannot read catalogue tables directly'
);
SELECT ok(has_schema_privilege('hbs_api', 'catalog', 'USAGE'), 'API role can use catalogue schema');
SELECT ok(
  has_table_privilege('hbs_api', 'catalog.products', 'SELECT'),
  'API role has the only catalogue table read grant'
);
SELECT ok(
  NOT has_table_privilege('anon', 'catalog.products', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'catalog.products', 'SELECT'),
  'Supabase Data API roles have no direct catalogue table grant'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'catalog'
      AND tablename = 'products'
      AND policyname = 'catalog_products_api_all'
      AND roles = ARRAY['hbs_api']::name[]
  ),
  'API catalogue policy is scoped to hbs_api'
);
SELECT ok(
  (SELECT count(*) FROM catalog.products WHERE is_published) = 2
  AND (SELECT count(*) FROM catalog.products WHERE jsonb_typeof(product) = 'object') = 2,
  'Seeded products satisfy publication and JSON payload invariants'
);

SELECT * FROM finish();
ROLLBACK;
