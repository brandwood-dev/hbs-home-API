BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(32);

SELECT has_schema('iam', 'Private IAM schema exists');
SELECT has_schema('audit', 'Private audit schema exists');
SELECT has_table('iam', 'admin_profiles', 'Admin profiles table exists');
SELECT has_table('iam', 'roles', 'Roles table exists');
SELECT has_table('iam', 'permissions', 'Permissions table exists');
SELECT has_table('iam', 'role_permissions', 'Role permissions table exists');
SELECT has_table('iam', 'admin_user_roles', 'Admin role assignments table exists');
SELECT has_table('audit', 'events', 'Audit events table exists');

SELECT is((SELECT count(*)::integer FROM iam.roles), 5, 'Five canonical Admin roles are seeded');
SELECT ok(
  (SELECT count(*) FROM iam.permissions) >= 31,
  'The granular permission catalogue is seeded'
);
SELECT is(
  (SELECT count(*) FROM iam.role_permissions WHERE role_key = 'super_admin'),
  (SELECT count(*) FROM iam.permissions),
  'Super Admin maps to every declared permission'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM iam.role_permissions
    WHERE role_key = 'read_only' AND permission_key = 'audit.read'
  ),
  'Read-only Admins can inspect audit history'
);

SELECT ok(NOT has_schema_privilege('anon', 'iam', 'USAGE'), 'anon cannot use IAM schema');
SELECT ok(
  has_schema_privilege('authenticated', 'iam', 'USAGE')
  AND has_function_privilege(
    'authenticated',
    'iam.current_user_has_permission(text)',
    'EXECUTE'
  )
  AND NOT has_table_privilege('authenticated', 'iam.admin_profiles', 'SELECT'),
  'authenticated can invoke the IAM helper but cannot read IAM tables directly'
);
SELECT ok(NOT has_schema_privilege('anon', 'audit', 'USAGE'), 'anon cannot use audit schema');
SELECT ok(
  NOT has_schema_privilege('authenticated', 'audit', 'USAGE'),
  'authenticated users cannot use audit schema directly'
);
SELECT ok(has_schema_privilege('hbs_api', 'iam', 'USAGE'), 'API role can use IAM schema');
SELECT ok(has_schema_privilege('hbs_api', 'audit', 'USAGE'), 'API role can use audit schema');

SELECT has_index(
  'iam',
  'admin_profiles',
  'admin_profiles_invited_by_idx',
  'Admin invitation actor foreign key is indexed'
);
SELECT has_index(
  'iam',
  'admin_user_roles',
  'admin_user_roles_granted_by_idx',
  'Admin role grant actor foreign key is indexed'
);
SELECT has_index(
  'iam',
  'admin_user_roles',
  'admin_user_roles_revoked_by_idx',
  'Admin role revocation actor foreign key is indexed'
);
SELECT has_index(
  'iam',
  'admin_user_roles',
  'admin_user_roles_role_key_idx',
  'Admin role key foreign key is indexed'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'iam.admin_profiles'::regclass),
  'RLS is enabled on Admin profiles'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'iam.admin_user_roles'::regclass),
  'RLS is enabled on Admin role assignments'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'audit.events'::regclass),
  'RLS is enabled on audit events'
);

SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'product-media'),
  true,
  'Product media bucket is public'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'quote-attachments'),
  false,
  'Quote attachments bucket is private'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'admin-imports'),
  false,
  'Admin imports bucket is private'
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'phase2-admin@example.com',
  extensions.crypt('Test-password-123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

SELECT is(
  iam.provision_admin('PHASE2-ADMIN@EXAMPLE.COM'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'Operator helper provisions an existing Auth user case-insensitively'
);
SELECT is(
  (SELECT status FROM iam.admin_profiles WHERE auth_user_id = '11111111-1111-4111-8111-111111111111'),
  'active',
  'Provisioned Admin profile is active'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT ok(
  iam.current_user_has_permission('users.manage'),
  'An active Super Admin with aal2 passes Storage authorization'
);
RESET ROLE;

INSERT INTO audit.events (
  request_id,
  actor_user_id,
  actor_email,
  action,
  resource_type,
  outcome
)
VALUES (
  'pgtap-phase-2',
  '11111111-1111-4111-8111-111111111111',
  'phase2-admin@example.com',
  'test.audit_event_created',
  'test_resource',
  'success'
);

SELECT throws_ok(
  $$UPDATE audit.events SET outcome = 'failure' WHERE request_id = 'pgtap-phase-2'$$,
  '55000',
  'Audit events are immutable.',
  'Audit updates are rejected by the append-only trigger'
);

SELECT * FROM finish();
ROLLBACK;
