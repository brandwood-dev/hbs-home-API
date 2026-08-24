-- Phase 10B — Dynamic editorial articles
-- The API is the only writer. Public clients receive published revisions only.

create table content.article_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_article_categories_slug_length check (char_length(btrim(slug)) between 1 and 80),
  constraint content_article_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint content_article_categories_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint content_article_categories_sort_order check (sort_order >= 0)
);

create unique index content_article_categories_slug_unique on content.article_categories (slug);
create index content_article_categories_active_order_idx
  on content.article_categories (is_active, sort_order, name);

create table content.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  category_id uuid not null references content.article_categories (id) on delete restrict,
  status text not null default 'draft',
  is_featured boolean not null default false,
  home_sort_order integer not null default 0,
  author_name text not null default 'HBS HOME',
  published_at timestamptz,
  created_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  updated_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_articles_slug_length check (char_length(btrim(slug)) between 1 and 160),
  constraint content_articles_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint content_articles_status check (status in ('draft', 'published', 'archived')),
  constraint content_articles_home_sort_order check (home_sort_order >= 0),
  constraint content_articles_author_length check (char_length(btrim(author_name)) between 1 and 120),
  constraint content_articles_published_at check (
    (status = 'published' and published_at is not null) or
    (status in ('draft', 'archived'))
  )
);

create unique index content_articles_slug_unique
  on content.articles (slug)
  where status <> 'archived';
create index content_articles_public_listing_idx
  on content.articles (status, is_featured, home_sort_order, published_at desc, id desc);
create index content_articles_category_listing_idx
  on content.articles (category_id, status, published_at desc, id desc);

create table content.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references content.articles (id) on delete cascade,
  status text not null default 'draft',
  version integer not null default 1,
  title text not null,
  excerpt text not null,
  body_blocks jsonb not null default '[]'::jsonb,
  cover_media_asset_id uuid references content.media_assets (id) on delete set null,
  reading_time_minutes integer not null default 1,
  seo_title text,
  seo_description text,
  created_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_article_revisions_status check (status in ('draft', 'published', 'archived')),
  constraint content_article_revisions_version_positive check (version > 0),
  constraint content_article_revisions_title_length check (char_length(btrim(title)) between 1 and 240),
  constraint content_article_revisions_excerpt_length check (char_length(btrim(excerpt)) between 1 and 600),
  constraint content_article_revisions_body_array check (jsonb_typeof(body_blocks) = 'array'),
  constraint content_article_revisions_reading_time check (reading_time_minutes between 1 and 120),
  constraint content_article_revisions_seo_title_length check (seo_title is null or char_length(btrim(seo_title)) between 1 and 160),
  constraint content_article_revisions_seo_description_length check (seo_description is null or char_length(btrim(seo_description)) between 1 and 320),
  constraint content_article_revisions_version_unique unique (article_id, version)
);

create unique index content_article_revisions_one_draft
  on content.article_revisions (article_id)
  where status = 'draft';
create unique index content_article_revisions_one_published
  on content.article_revisions (article_id)
  where status = 'published';
create index content_article_revisions_article_status_idx
  on content.article_revisions (article_id, status, version desc);
create index content_article_revisions_cover_media_idx
  on content.article_revisions (cover_media_asset_id)
  where cover_media_asset_id is not null;

create or replace function content.set_article_updated_at()
returns trigger
language plpgsql
set search_path = content, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger content_article_categories_set_updated_at
before update on content.article_categories
for each row execute function content.set_article_updated_at();

create trigger content_articles_set_updated_at
before update on content.articles
for each row execute function content.set_article_updated_at();

create trigger content_article_revisions_set_updated_at
before update on content.article_revisions
for each row execute function content.set_article_updated_at();

alter table content.article_categories enable row level security;
alter table content.articles enable row level security;
alter table content.article_revisions enable row level security;

create policy content_article_categories_api_all on content.article_categories
  for all to hbs_api using (true) with check (true);
create policy content_articles_api_all on content.articles
  for all to hbs_api using (true) with check (true);
create policy content_article_revisions_api_all on content.article_revisions
  for all to hbs_api using (true) with check (true);

grant usage on schema content to hbs_api;
grant select, insert, update on content.article_categories to hbs_api;
grant select, insert, update on content.articles to hbs_api;
grant select, insert, update on content.article_revisions to hbs_api;

insert into content.article_categories (slug, name, description, sort_order)
values
  ('conseils', 'Conseils', 'Guides pratiques pour choisir et installer vos textiles.', 10),
  ('inspiration', 'Inspiration', 'Idées et ambiances pour votre intérieur.', 20),
  ('guide', 'Guide', 'Repères pour vos projets de décoration.', 30)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

comment on table content.article_categories is
  'Admin-managed categories for the public HBS HOME inspiration journal.';
comment on table content.articles is
  'Stable article identity and publication metadata. Public reads require status=published.';
comment on table content.article_revisions is
  'Draft and published article content snapshots. Only active media may be published.';
