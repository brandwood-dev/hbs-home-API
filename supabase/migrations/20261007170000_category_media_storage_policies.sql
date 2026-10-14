-- Category images are uploaded by the authenticated Admin API and must be
-- writable through Storage only by admins with the catalog category permission.

drop policy if exists catalog_media_admin_insert on storage.objects;
create policy catalog_media_admin_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'catalog-media'
  and (select iam.current_user_has_permission('categories.write'))
);

drop policy if exists catalog_media_admin_update on storage.objects;
create policy catalog_media_admin_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'catalog-media'
  and (select iam.current_user_has_permission('categories.write'))
)
with check (
  bucket_id = 'catalog-media'
  and (select iam.current_user_has_permission('categories.write'))
);

drop policy if exists catalog_media_admin_delete on storage.objects;
create policy catalog_media_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'catalog-media'
  and (select iam.current_user_has_permission('categories.write'))
);
