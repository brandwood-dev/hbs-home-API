-- Phase 9D.1 — Versioned home-page merchandising configuration
-- Draft and published revisions are kept separately so editors can continue
-- working on the next version without mutating the public snapshot.

create table content.home_revisions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  version integer not null default 1,
  published_at timestamptz,
  created_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  updated_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_home_revisions_status check (status in ('draft', 'published', 'archived')),
  constraint content_home_revisions_version_positive check (version > 0),
  constraint content_home_revisions_published_at check (
    (status = 'published' and published_at is not null) or
    (status in ('draft', 'archived'))
  )
);

create unique index content_home_revisions_one_draft
  on content.home_revisions (status)
  where status = 'draft';
create unique index content_home_revisions_one_published
  on content.home_revisions (status)
  where status = 'published';
create index content_home_revisions_status_updated_idx
  on content.home_revisions (status, updated_at desc, id desc);

create table content.home_sections (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references content.home_revisions (id) on delete cascade,
  section_key text not null,
  sort_order integer not null,
  is_enabled boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  media_asset_id uuid references content.media_assets (id) on delete set null,
  mobile_media_asset_id uuid references content.media_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_home_sections_key_length check (
    char_length(btrim(section_key)) between 1 and 80
  ),
  constraint content_home_sections_key_format check (
    section_key = lower(btrim(section_key))
    and section_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ),
  constraint content_home_sections_sort_order check (sort_order >= 0),
  constraint content_home_sections_payload_object check (jsonb_typeof(payload) = 'object')
);

create unique index content_home_sections_revision_key_unique
  on content.home_sections (revision_id, section_key);
create unique index content_home_sections_revision_order_unique
  on content.home_sections (revision_id, sort_order);
create index content_home_sections_revision_order_idx
  on content.home_sections (revision_id, sort_order, id);
create index content_home_sections_media_idx
  on content.home_sections (media_asset_id)
  where media_asset_id is not null;
create index content_home_sections_mobile_media_idx
  on content.home_sections (mobile_media_asset_id)
  where mobile_media_asset_id is not null;

create table content.home_shop_the_look_hotspots (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references content.home_sections (id) on delete cascade,
  product_id text not null references catalog.products (id) on delete restrict,
  x_percent numeric(5, 2) not null,
  y_percent numeric(5, 2) not null,
  label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_home_hotspots_x_percent check (x_percent between 0 and 100),
  constraint content_home_hotspots_y_percent check (y_percent between 0 and 100),
  constraint content_home_hotspots_label_length check (
    label is null or char_length(btrim(label)) between 1 and 160
  ),
  constraint content_home_hotspots_sort_order check (sort_order >= 0)
);

create unique index content_home_hotspots_section_product_unique
  on content.home_shop_the_look_hotspots (section_id, product_id);
create unique index content_home_hotspots_section_order_unique
  on content.home_shop_the_look_hotspots (section_id, sort_order);
create index content_home_hotspots_section_order_idx
  on content.home_shop_the_look_hotspots (section_id, sort_order, id);
create index content_home_hotspots_product_idx
  on content.home_shop_the_look_hotspots (product_id);

create trigger content_home_revisions_set_updated_at
before update on content.home_revisions
for each row execute function content.set_editorial_page_updated_at();

create trigger content_home_sections_set_updated_at
before update on content.home_sections
for each row execute function content.set_editorial_page_updated_at();

create trigger content_home_hotspots_set_updated_at
before update on content.home_shop_the_look_hotspots
for each row execute function content.set_editorial_page_updated_at();

alter table content.home_revisions enable row level security;
alter table content.home_sections enable row level security;
alter table content.home_shop_the_look_hotspots enable row level security;

create policy content_home_revisions_api_all on content.home_revisions
  for all to hbs_api using (true) with check (true);
create policy content_home_sections_api_all on content.home_sections
  for all to hbs_api using (true) with check (true);
create policy content_home_hotspots_api_all on content.home_shop_the_look_hotspots
  for all to hbs_api using (true) with check (true);

grant select, insert, update, delete on content.home_revisions to hbs_api;
grant select, insert, update, delete on content.home_sections to hbs_api;
grant select, insert, update, delete on content.home_shop_the_look_hotspots to hbs_api;

comment on table content.home_revisions is
  'Versioned Admin-managed homepage revisions. Only the published snapshot is public.';
comment on table content.home_sections is
  'Ordered, enabled homepage sections with structured payloads and optional media.';
comment on table content.home_shop_the_look_hotspots is
  'Product hotspots positioned as percentages on a Shop the Look section image.';
