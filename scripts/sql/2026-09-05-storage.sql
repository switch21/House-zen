-- ============================================================================
-- HOUSE-ZEN — Bucket public de médias + politiques Storage
-- Lectures publiques (page vitrine), écritures réservées aux authentifiés,
-- modifications/suppressions limitées au propriétaire de l'objet.
-- Idempotent.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('hz-media', 'hz-media', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'hz-media-public-read') then
    create policy "hz-media-public-read" on storage.objects
      for select using (bucket_id = 'hz-media');
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'hz-media-auth-insert') then
    create policy "hz-media-auth-insert" on storage.objects
      for insert to authenticated with check (bucket_id = 'hz-media');
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'hz-media-owner-update') then
    create policy "hz-media-owner-update" on storage.objects
      for update to authenticated
      using (bucket_id = 'hz-media' and owner = auth.uid());
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'hz-media-owner-delete') then
    create policy "hz-media-owner-delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'hz-media' and owner = auth.uid());
  end if;
end $$;

select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'hz-media-%'
order by policyname;
