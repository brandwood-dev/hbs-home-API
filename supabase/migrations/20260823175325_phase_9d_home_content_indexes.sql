-- Phase 9D.1 performance hardening — cover the revision actor foreign keys.
create index content_home_revisions_created_by_idx
  on content.home_revisions (created_by)
  where created_by is not null;

create index content_home_revisions_updated_by_idx
  on content.home_revisions (updated_by)
  where updated_by is not null;
