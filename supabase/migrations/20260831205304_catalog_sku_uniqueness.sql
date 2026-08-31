-- Canonicalise variant SKUs before enforcing the invariant.  SKU identity is
-- case-insensitive and ignores accidental surrounding whitespace.  Refuse to
-- guess when legacy data already contains a semantic duplicate: the deployer
-- must resolve that pair explicitly so order history is never rewritten
-- silently.
do $$
begin
  if exists (
    select 1
    from catalog.product_variants
    group by upper(btrim(sku))
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce canonical SKU uniqueness: duplicate SKU values already exist.';
  end if;
end
$$;

update catalog.product_variants
set sku = upper(btrim(sku))
where sku <> upper(btrim(sku));

-- Replace the legacy case-sensitive index with the canonical expression
-- index.  This keeps SKU uniqueness global across products and statuses,
-- including archived variants, while making the rule match the API.
drop index if exists catalog.catalog_product_variants_sku_unique;
create unique index catalog_product_variants_sku_unique
  on catalog.product_variants (upper(btrim(sku)));
