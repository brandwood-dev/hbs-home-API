-- HBS HOME Phase 8B: private, opaque-token guest favorites.
-- The browser only receives a random HttpOnly token. The token hash is the
-- only identifier stored in PostgreSQL; no customer account is required yet.

create table commerce.favorite_items (
  token_hash text not null,
  product_id text not null references catalog.products (id) on delete restrict,
  added_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_accessed_at timestamptz not null default now(),
  primary key (token_hash, product_id),
  constraint commerce_favorite_items_token_hash_format check (
    token_hash = btrim(token_hash) and char_length(token_hash) = 64
  ),
  constraint commerce_favorite_items_expiry check (expires_at > added_at)
);

create index commerce_favorite_items_recent_idx
  on commerce.favorite_items (token_hash, added_at desc);
create index commerce_favorite_items_expiry_idx
  on commerce.favorite_items (expires_at, token_hash);

alter table commerce.favorite_items enable row level security;

-- This table is private to the Render API connection. Browser clients never
-- access it through the Supabase Data API.
create policy favorite_items_api_all
  on commerce.favorite_items
  for all to hbs_api
  using (true)
  with check (true);

revoke all on commerce.favorite_items from anon, authenticated, public;
grant select, insert, update, delete on commerce.favorite_items to hbs_api;

comment on table commerce.favorite_items is
  'Opaque-token guest favorites. Product data is re-resolved from published catalog rows by the API.';
