-- Phase 9C — Editorial media foundation
-- The API remains the only writer for metadata. Supabase Storage handles the
-- binary object, while this table provides an auditable, searchable Admin view.

create schema if not exists content;

create table content.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  public_url text not null,
  name text not null,
  alt text not null,
  width integer,
  height integer,
  mime_type text not null,
  status text not null default 'draft',
  usage text not null default 'unassigned',
  created_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  updated_by uuid references iam.admin_profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_media_assets_path_length check (char_length(btrim(storage_path)) between 1 and 500),
  constraint content_media_assets_url_length check (char_length(btrim(public_url)) between 1 and 2048),
  constraint content_media_assets_name_length check (char_length(btrim(name)) between 1 and 240),
  constraint content_media_assets_alt_length check (char_length(btrim(alt)) between 1 and 240),
  constraint content_media_assets_dimensions check (
    (width is null and height is null) or (width is not null and height is not null and width > 0 and height > 0)
  ),
  constraint content_media_assets_mime_type check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  ),
  constraint content_media_assets_status check (status in ('draft', 'active', 'archived')),
  constraint content_media_assets_usage_length check (char_length(btrim(usage)) between 1 and 80)
);

create unique index content_media_assets_storage_path_unique
  on content.media_assets (storage_path);
create index content_media_assets_status_created_idx
  on content.media_assets (status, created_at desc, id desc);
create index content_media_assets_usage_idx
  on content.media_assets (usage, status, updated_at desc);

create or replace function content.set_media_asset_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger content_media_assets_set_updated_at
before update on content.media_assets
for each row execute function content.set_media_asset_updated_at();

alter table content.media_assets enable row level security;

create policy content_media_assets_api_all on content.media_assets
  for all to hbs_api using (true) with check (true);

grant usage on schema content to hbs_api;
grant select, insert, update on content.media_assets to hbs_api;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'editorial-media',
  'editorial-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy editorial_media_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'editorial-media');

create policy editorial_media_admin_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'editorial-media'
  and (select iam.current_user_has_permission('media.write'))
);

create policy editorial_media_admin_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'editorial-media'
  and (select iam.current_user_has_permission('media.write'))
)
with check (
  bucket_id = 'editorial-media'
  and (select iam.current_user_has_permission('media.write'))
);

create policy editorial_media_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'editorial-media'
  and (select iam.current_user_has_permission('media.write'))
);

comment on table content.media_assets is
  'Admin-managed editorial media metadata referencing the editorial-media Storage bucket.';
