begin;

select plan(6);

select has_table(
  'content',
  'media_assets',
  'Editorial media metadata table exists'
);
select has_index(
  'content',
  'media_assets',
  'content_media_assets_storage_path_unique',
  'Editorial media storage paths are unique'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'content.media_assets'::regclass),
  'RLS is enabled on editorial media metadata'
);
select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'editorial-media'
      and public = true
      and file_size_limit = 10485760
  ),
  'Editorial media bucket is public and capped at 10 MiB'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'editorial_media_admin_insert'
  ),
  'Editorial media writes require the media.write permission'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'content'
      and tablename = 'media_assets'
      and policyname = 'content_media_assets_api_all'
  ),
  'The API role has a dedicated RLS policy for editorial media'
);

select * from finish();
rollback;

