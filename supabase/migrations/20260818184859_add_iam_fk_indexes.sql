-- Cover IAM foreign keys used by operator and audit-oriented lookups.

create index admin_profiles_invited_by_idx
  on iam.admin_profiles (invited_by);

create index admin_user_roles_granted_by_idx
  on iam.admin_user_roles (granted_by);

create index admin_user_roles_revoked_by_idx
  on iam.admin_user_roles (revoked_by);

create index admin_user_roles_role_key_idx
  on iam.admin_user_roles (role_key);
