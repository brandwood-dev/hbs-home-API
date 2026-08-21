-- HBS HOME Phase 5B: promotion administration metadata.
-- The public cart evaluator continues to use the same authoritative rule
-- columns; `name` is an Admin-only label and is never trusted for pricing.

alter table commerce.promotions
  add column name text;

update commerce.promotions
set name = code
where name is null;

alter table commerce.promotions
  alter column name set default '',
  alter column name set not null;

alter table commerce.promotions
  add constraint commerce_promotions_name check (
    char_length(btrim(name)) between 1 and 160
  );

comment on column commerce.promotions.name is
  'Admin display label; pricing is always calculated from the rule columns.';
