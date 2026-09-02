-- Allow the API role to permanently remove archived articles.
-- Keep the destructive privilege scoped by an RLS policy: only rows already
-- archived by the API can be physically deleted.
drop policy if exists content_articles_api_all on content.articles;
create policy content_articles_api_select on content.articles
  for select to hbs_api using (true);
create policy content_articles_api_insert on content.articles
  for insert to hbs_api with check (true);
create policy content_articles_api_update on content.articles
  for update to hbs_api using (true) with check (true);
create policy content_articles_api_delete on content.articles
  for delete to hbs_api using (status = 'archived');

grant delete on content.articles to hbs_api;
