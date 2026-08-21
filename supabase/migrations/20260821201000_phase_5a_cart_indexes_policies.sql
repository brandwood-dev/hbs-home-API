-- Phase 5A corrective indexes/policies identified by Supabase advisors.
create index commerce_cart_items_variant_idx
  on commerce.cart_items (variant_id, cart_id);

drop policy if exists promotions_api_read on commerce.promotions;
