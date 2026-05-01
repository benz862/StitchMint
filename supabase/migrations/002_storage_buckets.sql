-- StitchMint storage buckets + object policies
-- Paths used by the app: `{auth.uid()}/{pattern_id}/...` under each bucket.
-- The service role bypasses RLS; these policies let authenticated clients use Storage directly if you add that later.

-- Optional: set a 20 MB limit per bucket in Dashboard → Storage → bucket → Configuration.
insert into storage.buckets (id, name, public)
values
  ('originals', 'originals', false),
  ('previews', 'previews', false),
  ('packages', 'packages', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  updated_at = now();

-- Idempotent policy refresh
drop policy if exists "stitchmint_storage_select_own" on storage.objects;
drop policy if exists "stitchmint_storage_insert_own" on storage.objects;
drop policy if exists "stitchmint_storage_update_own" on storage.objects;
drop policy if exists "stitchmint_storage_delete_own" on storage.objects;

create policy "stitchmint_storage_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('originals', 'previews', 'packages')
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "stitchmint_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('originals', 'previews', 'packages')
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "stitchmint_storage_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('originals', 'previews', 'packages')
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id in ('originals', 'previews', 'packages')
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "stitchmint_storage_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('originals', 'previews', 'packages')
  and split_part(name, '/', 1) = auth.uid()::text
);
