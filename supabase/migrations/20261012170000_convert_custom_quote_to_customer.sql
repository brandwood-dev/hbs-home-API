alter table commerce.custom_quote_requests
  add column if not exists customer_id uuid references commerce.customers (id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references auth.users (id) on delete set null;

create index if not exists custom_quote_requests_customer_idx
  on commerce.custom_quote_requests (customer_id)
  where customer_id is not null;
