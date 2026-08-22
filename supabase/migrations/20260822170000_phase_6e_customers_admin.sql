-- HBS HOME Phase 6E: persistent customer profiles for the Admin sales workspace.
-- Customer PII is API-only. The browser never reads these tables directly.

alter table commerce.customers
  add column if not exists governorate text not null default '',
  add column if not exists preferred_channel text,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists internal_notes text not null default '',
  add column if not exists merged_into_customer_id uuid,
  add column if not exists merged_at timestamptz;

alter table commerce.customers
  add constraint commerce_customers_governorate_length
    check (char_length(governorate) <= 120),
  add constraint commerce_customers_preferred_channel
    check (preferred_channel is null or preferred_channel in ('phone', 'email', 'whatsapp')),
  add constraint commerce_customers_tags_array
    check (jsonb_typeof(tags) = 'array'),
  add constraint commerce_customers_internal_notes_length
    check (char_length(internal_notes) <= 10_000);

alter table commerce.customers
  add constraint commerce_customers_merged_into_fk
    foreign key (merged_into_customer_id) references commerce.customers (id) on delete restrict;

create index if not exists commerce_customers_governorate_idx
  on commerce.customers (governorate, updated_at desc);
create index if not exists commerce_customers_merged_idx
  on commerce.customers (merged_into_customer_id)
  where merged_into_customer_id is not null;
create index if not exists commerce_customers_tags_gin_idx
  on commerce.customers using gin (tags);

create table commerce.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references commerce.customers (id) on delete restrict,
  label text,
  governorate text not null,
  city text not null,
  postal_code text,
  address_line text not null,
  landmark text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_customer_addresses_label_length check (label is null or char_length(label) <= 80),
  constraint commerce_customer_addresses_governorate_length check (char_length(governorate) between 1 and 120),
  constraint commerce_customer_addresses_city_length check (char_length(city) between 1 and 120),
  constraint commerce_customer_addresses_postal_length check (postal_code is null or char_length(postal_code) <= 20),
  constraint commerce_customer_addresses_line_length check (char_length(address_line) between 1 and 240),
  constraint commerce_customer_addresses_landmark_length check (landmark is null or char_length(landmark) <= 160)
);

create index commerce_customer_addresses_customer_idx
  on commerce.customer_addresses (customer_id, is_default desc, updated_at desc);
create unique index commerce_customer_addresses_one_default_idx
  on commerce.customer_addresses (customer_id) where is_default;
create trigger customer_addresses_set_updated_at before update on commerce.customer_addresses
for each row execute function commerce.set_updated_at();

create table commerce.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references commerce.customers (id) on delete restrict,
  body text not null,
  author_user_id uuid not null,
  author_name text not null,
  created_at timestamptz not null default now(),
  constraint commerce_customer_notes_body_length check (char_length(btrim(body)) between 1 and 2_000),
  constraint commerce_customer_notes_author_length check (char_length(btrim(author_name)) between 1 and 160)
);

create index commerce_customer_notes_customer_idx
  on commerce.customer_notes (customer_id, created_at desc, id desc);

alter table commerce.customer_addresses enable row level security;
alter table commerce.customer_notes enable row level security;

create policy customer_addresses_api_all on commerce.customer_addresses
  for all to hbs_api using (true) with check (true);
create policy customer_notes_api_all on commerce.customer_notes
  for all to hbs_api using (true) with check (true);

grant select, insert, update, delete on commerce.customer_addresses to hbs_api;
grant select, insert, update on commerce.customer_notes to hbs_api;

comment on table commerce.customer_addresses is
  'API-only saved delivery addresses for Admin customer profiles.';
comment on table commerce.customer_notes is
  'Append-only internal notes for Admin customer profiles.';
