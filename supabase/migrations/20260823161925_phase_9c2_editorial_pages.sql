-- Phase 9C.2 — Editorial pages and reusable blocks
-- Draft content is private to the API. The public API exposes only published
-- pages and only active media references.

create table content.editorial_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  body text not null default '',
  seo_title text,
  seo_description text,
  status text not null default 'draft',
  version integer not null default 1,
  published_at timestamptz,
  created_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  updated_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_editorial_pages_slug_length check (char_length(btrim(slug)) between 1 and 160),
  constraint content_editorial_pages_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint content_editorial_pages_title_length check (char_length(btrim(title)) between 1 and 240),
  constraint content_editorial_pages_body_length check (char_length(body) <= 200000),
  constraint content_editorial_pages_seo_title_length check (seo_title is null or char_length(btrim(seo_title)) between 1 and 160),
  constraint content_editorial_pages_seo_description_length check (seo_description is null or char_length(btrim(seo_description)) between 1 and 320),
  constraint content_editorial_pages_status check (status in ('draft', 'published', 'archived')),
  constraint content_editorial_pages_version_positive check (version > 0),
  constraint content_editorial_pages_published_at check (
    (status = 'published' and published_at is not null) or
    (status in ('draft', 'archived'))
  )
);

create unique index content_editorial_pages_slug_unique
  on content.editorial_pages (slug)
  where status <> 'archived';
create index content_editorial_pages_status_updated_idx
  on content.editorial_pages (status, updated_at desc, id desc);

create table content.editorial_page_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references content.editorial_pages (id) on delete cascade,
  sort_order integer not null,
  block_type text not null,
  payload jsonb not null default '{}'::jsonb,
  media_asset_id uuid references content.media_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_editorial_page_blocks_sort_order check (sort_order >= 0),
  constraint content_editorial_page_blocks_type_length check (char_length(btrim(block_type)) between 1 and 80),
  constraint content_editorial_page_blocks_payload_object check (jsonb_typeof(payload) = 'object')
);

create unique index content_editorial_page_blocks_order_unique
  on content.editorial_page_blocks (page_id, sort_order);
create index content_editorial_page_blocks_page_order_idx
  on content.editorial_page_blocks (page_id, sort_order, id);
create index content_editorial_page_blocks_media_idx
  on content.editorial_page_blocks (media_asset_id)
  where media_asset_id is not null;

create or replace function content.set_editorial_page_updated_at()
returns trigger
language plpgsql
set search_path = content, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger content_editorial_pages_set_updated_at
before update on content.editorial_pages
for each row execute function content.set_editorial_page_updated_at();

create trigger content_editorial_page_blocks_set_updated_at
before update on content.editorial_page_blocks
for each row execute function content.set_editorial_page_updated_at();

alter table content.editorial_pages enable row level security;
alter table content.editorial_page_blocks enable row level security;

create policy content_editorial_pages_api_all on content.editorial_pages
  for all to hbs_api using (true) with check (true);
create policy content_editorial_page_blocks_api_all on content.editorial_page_blocks
  for all to hbs_api using (true) with check (true);

grant select, insert, update on content.editorial_pages to hbs_api;
grant select, insert, update, delete on content.editorial_page_blocks to hbs_api;

comment on table content.editorial_pages is
  'Versioned Admin-managed editorial pages. Only published rows are public.';
comment on table content.editorial_page_blocks is
  'Ordered, reusable editorial blocks optionally linked to an active media asset.';
