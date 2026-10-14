alter table commerce.custom_quote_requests
  add column if not exists request_type text not null default 'particulier',
  add column if not exists professional_details jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'commerce.custom_quote_requests'::regclass
      and conname = 'custom_quote_request_type_check'
  ) then
    alter table commerce.custom_quote_requests
      add constraint custom_quote_request_type_check
      check (request_type in ('particulier', 'professionnels'));
  end if;
end;
$$;

create index if not exists custom_quote_requests_type_created_idx
  on commerce.custom_quote_requests (request_type, created_at desc, id desc);

comment on column commerce.custom_quote_requests.request_type is
  'Origin of the quote request: individual or professional.';
comment on column commerce.custom_quote_requests.professional_details is
  'Professional lead fields captured from the B2B quote form.';
