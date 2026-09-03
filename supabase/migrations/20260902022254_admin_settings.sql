-- Admin settings are intentionally stored as a single versioned JSON document.
-- Secrets and auth credentials must never be stored in this payload.
create table if not exists iam.admin_settings (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  version integer not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table iam.admin_settings enable row level security;

drop policy if exists admin_settings_api_select on iam.admin_settings;
create policy admin_settings_api_select on iam.admin_settings
  for select to hbs_api using (true);

drop policy if exists admin_settings_api_insert on iam.admin_settings;
create policy admin_settings_api_insert on iam.admin_settings
  for insert to hbs_api with check (true);

drop policy if exists admin_settings_api_update on iam.admin_settings;
create policy admin_settings_api_update on iam.admin_settings
  for update to hbs_api using (true) with check (true);

grant select, insert, update on iam.admin_settings to hbs_api;

insert into iam.admin_settings (id, payload)
values (
  1,
  jsonb_build_object(
    'store', jsonb_build_object(
      'name', 'HBS HOME',
      'currency', 'TND',
      'language', 'fr',
      'timezone', 'Africa/Tunis',
      'address', ''
    ),
    'shipping', jsonb_build_object(
      'standardFeeMinor', 7000,
      'freeShippingThresholdMinor', 20000,
      'estimatedDeliveryLabel', 'Livraison sous 24 à 48 heures',
      'storePickupEnabled', false,
      'pickupAddress', ''
    ),
    'contact', jsonb_build_object(
      'phone', '',
      'email', '',
      'whatsapp', '',
      'openingHours', ''
    ),
    'social', jsonb_build_object(
      'facebook', '',
      'instagram', '',
      'tiktok', ''
    ),
    'seo', jsonb_build_object(
      'defaultTitle', 'HBS HOME',
      'defaultDescription', '',
      'ogImageUrl', ''
    ),
    'features', jsonb_build_object(
      'checkout', true,
      'favorites', true,
      'reviews', false,
      'customMade', true,
      'professionals', false,
      'orderTracking', true,
      'customerAccounts', false,
      'onlinePayment', false
    )
  )
)
on conflict (id) do nothing;
