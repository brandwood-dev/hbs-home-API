-- Category image management follows the Admin API's password-only policy.
-- Keep this permission narrowly scoped instead of changing the shared RBAC
-- helper, which is also used by flows that may intentionally require MFA.
create or replace function iam.current_user_can_manage_category_media()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from iam.admin_profiles profile
      join iam.admin_user_roles assignment
        on assignment.auth_user_id = profile.auth_user_id
      join iam.role_permissions mapping
        on mapping.role_key = assignment.role_key
      where profile.auth_user_id = (select auth.uid())
        and profile.status = 'active'
        and assignment.revoked_at is null
        and (assignment.expires_at is null or assignment.expires_at > now())
        and mapping.permission_key = 'categories.write'
    );
$function$;

revoke all on function iam.current_user_can_manage_category_media() from public, anon;
grant execute on function iam.current_user_can_manage_category_media() to authenticated;

drop policy if exists catalog_media_admin_insert on storage.objects;
create policy catalog_media_admin_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'catalog-media'
  and (select iam.current_user_can_manage_category_media())
);

drop policy if exists catalog_media_admin_update on storage.objects;
create policy catalog_media_admin_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'catalog-media'
  and (select iam.current_user_can_manage_category_media())
)
with check (
  bucket_id = 'catalog-media'
  and (select iam.current_user_can_manage_category_media())
);

drop policy if exists catalog_media_admin_delete on storage.objects;
create policy catalog_media_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'catalog-media'
  and (select iam.current_user_can_manage_category_media())
);
