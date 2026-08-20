-- Keep one permissive hbs_api policy on the private products table. The
-- replacement policy from Phase 3C.1 covers both public reads (the API adds
-- is_published predicates) and Admin mutations, so the legacy read-only policy
-- is redundant and needlessly evaluated for every SELECT.
drop policy if exists catalog_products_api_select on catalog.products;
