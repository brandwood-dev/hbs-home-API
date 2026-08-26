-- Phase 9C — Editorial media security and query hardening

-- Keep the trigger deterministic even if a caller changes the session
-- search_path. pg_catalog remains implicitly available for now().
alter function content.set_media_asset_updated_at()
set search_path = content, pg_temp;

-- Cover both audit-owner foreign keys for joins and deletes on admin profiles.
create index content_media_assets_created_by_idx
  on content.media_assets (created_by);
create index content_media_assets_updated_by_idx
  on content.media_assets (updated_by);
