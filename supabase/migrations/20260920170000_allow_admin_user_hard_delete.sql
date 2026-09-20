-- Allow the server-side Admin management repository to permanently remove a
-- team member's IAM rows. Audit events remain immutable and are intentionally
-- not deleted.

grant delete on iam.admin_profiles, iam.admin_user_roles to hbs_api;

drop policy if exists admin_profiles_api_delete on iam.admin_profiles;
create policy admin_profiles_api_delete on iam.admin_profiles
  for delete to hbs_api using (true);

drop policy if exists admin_user_roles_api_delete on iam.admin_user_roles;
create policy admin_user_roles_api_delete on iam.admin_user_roles
  for delete to hbs_api using (true);
