-- api_tokens: strictly owner-scoped. The Edge Function reads token rows with
-- the service role; clients only ever see their own tokens (hashes, not
-- plaintexts — the plaintext is shown once at creation and never stored).
alter table "api_tokens" enable row level security;

create policy "api_tokens_select" on "api_tokens"
  for select using (owner_id = (select auth.uid()));
create policy "api_tokens_insert" on "api_tokens"
  for insert with check (owner_id = (select auth.uid()));
create policy "api_tokens_update" on "api_tokens"
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "api_tokens_delete" on "api_tokens"
  for delete using (owner_id = (select auth.uid()));
