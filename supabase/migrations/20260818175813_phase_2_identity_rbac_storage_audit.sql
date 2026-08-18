-- HBS HOME Phase 2: private identity/RBAC, immutable audit and Storage policies.
-- Business tables remain out of scope until the catalogue phase.

create schema if not exists iam authorization postgres;
create schema if not exists audit authorization postgres;

revoke all on schema iam from public, anon, authenticated;
revoke all on schema audit from public, anon, authenticated;

do $$
begin
  create role hbs_api nologin noinherit;
exception
  when duplicate_object then null;
end
$$;

grant hbs_api to postgres;
grant usage on schema iam, audit to hbs_api;

create table iam.admin_profiles (
  auth_user_id uuid primary key references auth.users (id) on delete restrict,
  email text not null,
  display_name text,
  status text not null default 'invited',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint admin_profiles_email_normalized check (
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint admin_profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 120
  ),
  constraint admin_profiles_status check (
    status in ('invited', 'active', 'suspended', 'revoked')
  )
);

create unique index admin_profiles_email_unique
  on iam.admin_profiles (lower(email));
create index admin_profiles_status_idx
  on iam.admin_profiles (status);

create table iam.roles (
  key text primary key,
  name text not null,
  description text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint roles_name_length check (char_length(name) between 1 and 100)
);

create table iam.permissions (
  key text primary key,
  description text not null,
  created_at timestamptz not null default now(),
  constraint permissions_key_format check (
    key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
  )
);

create table iam.role_permissions (
  role_key text not null references iam.roles (key) on delete cascade,
  permission_key text not null references iam.permissions (key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create index role_permissions_permission_idx
  on iam.role_permissions (permission_key, role_key);

create table iam.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references iam.admin_profiles (auth_user_id) on delete restrict,
  role_key text not null references iam.roles (key) on delete restrict,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  constraint admin_user_roles_expiry check (
    expires_at is null or expires_at > granted_at
  ),
  constraint admin_user_roles_revocation check (
    revoked_at is null or revoked_at >= granted_at
  )
);

create unique index admin_user_roles_one_active_role
  on iam.admin_user_roles (auth_user_id, role_key)
  where revoked_at is null;
create index admin_user_roles_active_user_idx
  on iam.admin_user_roles (auth_user_id, role_key)
  where revoked_at is null;

create function iam.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function iam.set_updated_at() from public;

create trigger admin_profiles_set_updated_at
before update on iam.admin_profiles
for each row execute function iam.set_updated_at();

insert into iam.roles (key, name, description)
values
  ('super_admin', 'Super administrateur', 'Accès complet et gestion des accès.'),
  ('catalog_manager', 'Responsable catalogue', 'Catalogue, catégories, attributs et médias.'),
  ('orders_manager', 'Responsable commandes', 'Commandes, clients et stock opérationnel.'),
  ('content_editor', 'Éditeur de contenu', 'Contenu éditorial et médias.'),
  ('read_only', 'Lecture seule', 'Consultation sans mutation.')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into iam.permissions (key, description)
values
  ('admin.session_read', 'Lire sa session et ses autorisations Admin.'),
  ('products.read', 'Lire les produits et variantes.'),
  ('products.write', 'Créer et modifier les produits et variantes.'),
  ('products.publish', 'Publier ou archiver les produits.'),
  ('categories.read', 'Lire les catégories et attributs.'),
  ('categories.write', 'Créer et modifier les catégories et attributs.'),
  ('media.read', 'Lire la médiathèque et les métadonnées privées.'),
  ('media.write', 'Téléverser, modifier et retirer des médias.'),
  ('inventory.read', 'Lire le stock et les mouvements.'),
  ('inventory.adjust', 'Créer un ajustement de stock.'),
  ('orders.read', 'Lire les commandes.'),
  ('orders.confirm', 'Confirmer une commande.'),
  ('orders.cancel', 'Annuler une commande.'),
  ('orders.ship', 'Expédier ou livrer une commande.'),
  ('orders.refund', 'Enregistrer un remboursement.'),
  ('customers.read', 'Lire les clients.'),
  ('customers.write', 'Modifier les informations client autorisées.'),
  ('customers.merge', 'Fusionner des fiches client.'),
  ('content.read', 'Lire les contenus éditoriaux.'),
  ('content.write', 'Créer et modifier les contenus.'),
  ('content.publish', 'Publier les contenus.'),
  ('promotions.read', 'Lire les promotions.'),
  ('promotions.write', 'Créer et modifier les promotions.'),
  ('quotes.read', 'Lire les demandes sur mesure et leurs pièces jointes.'),
  ('quotes.write', 'Traiter les demandes sur mesure.'),
  ('leads.read', 'Lire les prospects professionnels.'),
  ('leads.write', 'Traiter les prospects professionnels.'),
  ('users.read', 'Lire les profils, rôles et permissions Admin.'),
  ('users.manage', 'Inviter, suspendre et attribuer des rôles Admin.'),
  ('audit.read', 'Lire le journal d’audit.'),
  ('settings.manage', 'Modifier les paramètres sensibles.')
on conflict (key) do update
set description = excluded.description;

-- Super administrators receive every permission, including future permissions
-- only after a migration explicitly refreshes this mapping.
insert into iam.role_permissions (role_key, permission_key)
select 'super_admin', key from iam.permissions
on conflict do nothing;

insert into iam.role_permissions (role_key, permission_key)
values
  ('catalog_manager', 'admin.session_read'),
  ('catalog_manager', 'products.read'),
  ('catalog_manager', 'products.write'),
  ('catalog_manager', 'products.publish'),
  ('catalog_manager', 'categories.read'),
  ('catalog_manager', 'categories.write'),
  ('catalog_manager', 'media.read'),
  ('catalog_manager', 'media.write'),
  ('catalog_manager', 'inventory.read'),
  ('catalog_manager', 'promotions.read'),
  ('catalog_manager', 'promotions.write'),
  ('orders_manager', 'admin.session_read'),
  ('orders_manager', 'products.read'),
  ('orders_manager', 'inventory.read'),
  ('orders_manager', 'inventory.adjust'),
  ('orders_manager', 'orders.read'),
  ('orders_manager', 'orders.confirm'),
  ('orders_manager', 'orders.cancel'),
  ('orders_manager', 'orders.ship'),
  ('orders_manager', 'orders.refund'),
  ('orders_manager', 'customers.read'),
  ('orders_manager', 'customers.write'),
  ('orders_manager', 'quotes.read'),
  ('orders_manager', 'quotes.write'),
  ('orders_manager', 'leads.read'),
  ('orders_manager', 'leads.write'),
  ('content_editor', 'admin.session_read'),
  ('content_editor', 'content.read'),
  ('content_editor', 'content.write'),
  ('content_editor', 'content.publish'),
  ('content_editor', 'media.read'),
  ('content_editor', 'media.write'),
  ('read_only', 'admin.session_read'),
  ('read_only', 'products.read'),
  ('read_only', 'categories.read'),
  ('read_only', 'media.read'),
  ('read_only', 'inventory.read'),
  ('read_only', 'orders.read'),
  ('read_only', 'customers.read'),
  ('read_only', 'content.read'),
  ('read_only', 'promotions.read'),
  ('read_only', 'quotes.read'),
  ('read_only', 'leads.read'),
  ('read_only', 'users.read'),
  ('read_only', 'audit.read')
on conflict do nothing;

create function iam.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
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
        and mapping.permission_key = p_permission
    );
$$;

revoke all on function iam.current_user_has_permission(text) from public, anon;
grant usage on schema iam to authenticated;
grant execute on function iam.current_user_has_permission(text) to authenticated;

create function iam.provision_admin(
  p_email text,
  p_role_key text default 'super_admin',
  p_display_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = normalized_email;

  if target_user_id is null then
    raise exception 'No Supabase Auth user exists for the requested email.'
      using errcode = 'P0002';
  end if;

  if not exists (select 1 from iam.roles where key = p_role_key) then
    raise exception 'Unknown Admin role.' using errcode = '22023';
  end if;

  insert into iam.admin_profiles (auth_user_id, email, display_name, status)
  values (target_user_id, normalized_email, p_display_name, 'active')
  on conflict (auth_user_id) do update
  set email = excluded.email,
      display_name = coalesce(excluded.display_name, iam.admin_profiles.display_name),
      status = 'active';

  insert into iam.admin_user_roles (auth_user_id, role_key)
  values (target_user_id, p_role_key)
  on conflict (auth_user_id, role_key) where revoked_at is null do nothing;

  return target_user_id;
end;
$$;

revoke all on function iam.provision_admin(text, text, text) from public, anon, authenticated;

create table audit.events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  request_id text not null,
  actor_user_id uuid,
  actor_email text,
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null default 'success',
  source_ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_request_id_length check (char_length(request_id) between 1 and 128),
  constraint audit_action_format check (action ~ '^[a-z][a-z0-9_.]{2,127}$'),
  constraint audit_resource_type_format check (resource_type ~ '^[a-z][a-z0-9_.]{1,63}$'),
  constraint audit_outcome check (outcome in ('success', 'denied', 'failure')),
  constraint audit_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint audit_actor_email_normalized check (
    actor_email is null or actor_email = lower(btrim(actor_email))
  )
);

create index audit_events_occurred_at_idx
  on audit.events (occurred_at desc, id desc);
create index audit_events_actor_idx
  on audit.events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index audit_events_action_idx
  on audit.events (action, occurred_at desc);

create function audit.prevent_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit events are immutable.' using errcode = '55000';
end;
$$;

revoke all on function audit.prevent_event_mutation() from public;

create trigger audit_events_immutable
before update or delete on audit.events
for each row execute function audit.prevent_event_mutation();

alter table iam.admin_profiles enable row level security;
alter table iam.roles enable row level security;
alter table iam.permissions enable row level security;
alter table iam.role_permissions enable row level security;
alter table iam.admin_user_roles enable row level security;
alter table audit.events enable row level security;

create policy admin_profiles_api_select on iam.admin_profiles
  for select to hbs_api using (true);
create policy admin_profiles_api_insert on iam.admin_profiles
  for insert to hbs_api with check (true);
create policy admin_profiles_api_update on iam.admin_profiles
  for update to hbs_api using (true) with check (true);
create policy roles_api_select on iam.roles
  for select to hbs_api using (true);
create policy permissions_api_select on iam.permissions
  for select to hbs_api using (true);
create policy role_permissions_api_select on iam.role_permissions
  for select to hbs_api using (true);
create policy admin_user_roles_api_select on iam.admin_user_roles
  for select to hbs_api using (true);
create policy admin_user_roles_api_insert on iam.admin_user_roles
  for insert to hbs_api with check (true);
create policy admin_user_roles_api_update on iam.admin_user_roles
  for update to hbs_api using (true) with check (true);
create policy audit_events_api_select on audit.events
  for select to hbs_api using (true);
create policy audit_events_api_insert on audit.events
  for insert to hbs_api with check (true);

grant select, insert, update on iam.admin_profiles to hbs_api;
grant select on iam.roles, iam.permissions, iam.role_permissions to hbs_api;
grant select, insert, update on iam.admin_user_roles to hbs_api;
grant select, insert on audit.events to hbs_api;
grant usage, select on sequence audit.events_id_seq to hbs_api;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'product-media',
    'product-media',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'quote-attachments',
    'quote-attachments',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'admin-imports',
    'admin-imports',
    false,
    20971520,
    array[
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy product_media_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-media');

create policy product_media_admin_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-media'
  and (select iam.current_user_has_permission('media.write'))
);

create policy product_media_admin_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-media'
  and (select iam.current_user_has_permission('media.write'))
)
with check (
  bucket_id = 'product-media'
  and (select iam.current_user_has_permission('media.write'))
);

create policy product_media_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-media'
  and (select iam.current_user_has_permission('media.write'))
);

create policy private_media_admin_read
on storage.objects for select
to authenticated
using (
  bucket_id in ('quote-attachments', 'admin-imports')
  and (
    (bucket_id = 'quote-attachments' and (select iam.current_user_has_permission('quotes.read')))
    or (bucket_id = 'admin-imports' and (select iam.current_user_has_permission('media.read')))
  )
);

create policy private_media_admin_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('quote-attachments', 'admin-imports')
  and (
    (bucket_id = 'quote-attachments' and (select iam.current_user_has_permission('quotes.write')))
    or (bucket_id = 'admin-imports' and (select iam.current_user_has_permission('media.write')))
  )
);

create policy private_media_admin_update
on storage.objects for update
to authenticated
using (
  bucket_id in ('quote-attachments', 'admin-imports')
  and (
    (bucket_id = 'quote-attachments' and (select iam.current_user_has_permission('quotes.write')))
    or (bucket_id = 'admin-imports' and (select iam.current_user_has_permission('media.write')))
  )
)
with check (
  bucket_id in ('quote-attachments', 'admin-imports')
  and (
    (bucket_id = 'quote-attachments' and (select iam.current_user_has_permission('quotes.write')))
    or (bucket_id = 'admin-imports' and (select iam.current_user_has_permission('media.write')))
  )
);

create policy private_media_admin_delete
on storage.objects for delete
to authenticated
using (
  bucket_id in ('quote-attachments', 'admin-imports')
  and (
    (bucket_id = 'quote-attachments' and (select iam.current_user_has_permission('quotes.write')))
    or (bucket_id = 'admin-imports' and (select iam.current_user_has_permission('media.write')))
  )
);

comment on schema iam is 'Private HBS HOME Admin identity and RBAC data; never expose through the Data API.';
comment on schema audit is 'Append-only HBS HOME security and business audit events.';
comment on function iam.current_user_has_permission(text) is
  'Storage-only authorization helper. Requires an active Admin, an aal2 JWT and an active role assignment.';
comment on function iam.provision_admin(text, text, text) is
  'Operator-only helper used after a Supabase Auth invitation has created the user.';
