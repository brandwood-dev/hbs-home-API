begin;

select plan(12);

select has_table('content', 'article_categories', 'Article categories table exists');
select has_table('content', 'articles', 'Articles table exists');
select has_table('content', 'article_revisions', 'Article revisions table exists');
select ok((select relrowsecurity from pg_class where oid = 'content.articles'::regclass), 'Article identity has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'content.article_revisions'::regclass), 'Article revisions have RLS enabled');
select ok(exists (select 1 from pg_indexes where schemaname = 'content' and indexname = 'content_articles_public_listing_idx'), 'Public article listing index exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'content' and indexname = 'content_article_revisions_one_published'), 'One published revision per article is enforced');
select ok(exists (select 1 from pg_policies where schemaname = 'content' and tablename = 'articles' and policyname = 'content_articles_api_all' and cmd = 'SELECT'), 'API article select policy exists');
select ok(exists (select 1 from pg_policies where schemaname = 'content' and tablename = 'articles' and policyname = 'content_articles_api_insert' and cmd = 'INSERT'), 'API article insert policy exists');
select ok(exists (select 1 from pg_policies where schemaname = 'content' and tablename = 'articles' and policyname = 'content_articles_api_update' and cmd = 'UPDATE'), 'API article update policy exists');
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'content'
      and tablename = 'articles'
      and policyname = 'content_articles_api_delete'
      and cmd = 'DELETE'
      and qual::text like '%archived%'
  ),
  'API article delete policy is archived-only'
);
select ok(has_table_privilege('hbs_api', 'content.articles', 'DELETE'), 'API role can delete articles');

select * from finish();
rollback;
