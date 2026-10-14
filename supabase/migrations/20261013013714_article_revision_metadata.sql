alter table content.article_revisions
  add column metadata jsonb;

update content.article_revisions as revisions
set metadata = jsonb_build_object(
  'slug', articles.slug,
  'categoryId', articles.category_id,
  'isFeatured', articles.is_featured,
  'homeSortOrder', articles.home_sort_order,
  'authorName', articles.author_name
)
from content.articles as articles
where articles.id = revisions.article_id
  and revisions.status in ('draft', 'published');

comment on column content.article_revisions.metadata is
  'Draft/public article metadata kept with the revision so edits remain invisible until publish.';
