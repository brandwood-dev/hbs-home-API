-- Phase 10D — category and sub-category image uploads.
-- Binaries are written by the API with its server-only Supabase secret key;
-- the catalog remains publicly readable through the generated WebP URL.

alter table catalog.categories
  add column image_media_asset_id uuid
  references content.media_assets (id) on delete set null;

create index catalog_categories_image_media_asset_idx
  on catalog.categories (image_media_asset_id)
  where image_media_asset_id is not null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'catalog-media',
  'catalog-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy catalog_media_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'catalog-media');

comment on column catalog.categories.image_media_asset_id is
  'Canonical uploaded category image. image_url remains as a backward-compatible external URL fallback.';
