begin;

select plan(8);

select has_table('content', 'article_categories', 'Article categories table exists');
select has_table('content', 'articles', 'Articles table exists');
select has_table('content', 'article_revisions', 'Article revisions table exists');
select ok((select relrowsecurity from pg_class where oid = 'content.articles'::regclass), 'Article identity has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'content.article_revisions'::regclass), 'Article revisions have RLS enabled');
select ok(exists (select 1 from pg_indexes where schemaname = 'content' and indexname = 'content_articles_public_listing_idx'), 'Public article listing index exists');
select ok(exists (select 1 from pg_indexes where schemaname = 'content' and indexname = 'content_article_revisions_one_published'), 'One published revision per article is enforced');
select ok(exists (select 1 from pg_policies where schemaname = 'content' and tablename = 'articles' and policyname = 'content_articles_api_all'), 'API article policy exists');

select * from finish();
rollback;
