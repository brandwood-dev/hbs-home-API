-- Link custom quote requests to customer records when a prospect is qualified.
-- The nullable relationship keeps historical quote data if a customer is later removed.
alter table commerce.custom_quote_requests
  add column if not exists customer_id uuid references commerce.customers (id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid;

create index if not exists custom_quote_requests_customer_idx
  on commerce.custom_quote_requests (customer_id)
  where customer_id is not null;

comment on column commerce.custom_quote_requests.customer_id is
  'Customer created or associated when an admin converts this quote request.';
