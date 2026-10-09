create table commerce.custom_quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  product_type text not null,
  openings jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  governorate text not null,
  city text not null,
  preferred_contact text not null,
  attachment_metadata jsonb not null default '[]'::jsonb,
  accepted_privacy boolean not null,
  read_at timestamptz,
  archived_at timestamptz,
  email_sent_at timestamptz,
  email_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_quote_product_type_check check (product_type in ('rideaux', 'voilages', 'stores', 'ensemble_fenetre')),
  constraint custom_quote_preferred_contact_check check (preferred_contact in ('phone', 'whatsapp', 'email')),
  constraint custom_quote_accepted_privacy_check check (accepted_privacy = true)
);

create index custom_quote_requests_created_idx
  on commerce.custom_quote_requests (created_at desc, id desc);
create index custom_quote_requests_unread_idx
  on commerce.custom_quote_requests (created_at desc, id desc)
  where read_at is null and archived_at is null;
create index custom_quote_requests_email_idx
  on commerce.custom_quote_requests (email)
  where email is not null;

create trigger custom_quote_requests_set_updated_at
  before update on commerce.custom_quote_requests
  for each row execute function commerce.set_updated_at();

alter table commerce.custom_quote_requests enable row level security;

create policy custom_quote_requests_api_all on commerce.custom_quote_requests
  for all to hbs_api using (true) with check (true);

grant select, insert, update on commerce.custom_quote_requests to hbs_api;

comment on table commerce.custom_quote_requests is
  'Demandes de devis sur mesure envoyées depuis le site public. Aucun pipeline commercial : read_at et archived_at servent uniquement à la boîte de réception Admin.';
