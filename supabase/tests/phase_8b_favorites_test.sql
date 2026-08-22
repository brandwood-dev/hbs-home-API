BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

SELECT has_table(
  'commerce',
  'favorite_items',
  'Guest favorites table exists'
);
SELECT has_index(
  'commerce',
  'favorite_items',
  'commerce_favorite_items_recent_idx',
  'Favorite reads are indexed by token and recency'
);
SELECT has_index(
  'commerce',
  'favorite_items',
  'commerce_favorite_items_expiry_idx',
  'Favorite expiry cleanup is indexed'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'commerce.favorite_items'::regclass),
  'RLS is enabled on guest favorites'
);
SELECT ok(
  has_schema_privilege('hbs_api', 'commerce', 'USAGE'),
  'API role can use the private commerce schema'
);
SELECT ok(
  has_table_privilege('hbs_api', 'commerce.favorite_items', 'SELECT')
  AND has_table_privilege('hbs_api', 'commerce.favorite_items', 'INSERT')
  AND has_table_privilege('hbs_api', 'commerce.favorite_items', 'UPDATE')
  AND has_table_privilege('hbs_api', 'commerce.favorite_items', 'DELETE'),
  'API role has the required favorite table privileges'
);
SELECT ok(
  NOT has_table_privilege('anon', 'commerce.favorite_items', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'commerce.favorite_items', 'SELECT'),
  'Supabase Data API roles cannot read guest favorites directly'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'commerce'
      AND tablename = 'favorite_items'
      AND policyname = 'favorite_items_api_all'
      AND roles = ARRAY['hbs_api']::name[]
  ),
  'Favorite policy is scoped to hbs_api'
);

SELECT * FROM finish();
ROLLBACK;
