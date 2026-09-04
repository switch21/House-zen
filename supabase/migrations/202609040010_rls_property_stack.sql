-- ============================================================================
-- HOUSE-ZEN — 202609040010_rls_property_stack.sql (PHASE 3)
-- Additional RLS refinements for the property stack (owner-only destructive ops)
-- + public read policy for published properties used by the booking widget.
-- ============================================================================

-- Public availability endpoint reads published properties WITHOUT auth:
-- dedicated SECURITY DEFINER functions expose minimal data (see 016/034).
-- This policy explicitly blocks anon direct table reads:
create policy properties_no_anon on properties
  for select to anon using (false);

-- Historic / compliance: blocking deletes on the property stack at the DB level
-- is delegated to FK ON DELETE restrict + audit trail. Owner-only deletes:
create policy properties_delete_owner on properties
  for delete using (hz_role_in_tenant(tenant_id) = 'owner');

-- Storage buckets for property media (spec: Supabase Storage, tenant isolation).
insert into storage.buckets (id, name, public)
values ('property-media', 'property-media', false)
on conflict (id) do nothing;

create policy storage_property_read on storage.objects
  for select using (
    bucket_id = 'property-media'
    and (storage.foldername(name))[1] = hz_current_tenant_id()::text
  );
create policy storage_property_write on storage.objects
  for insert with check (
    bucket_id = 'property-media'
    and (storage.foldername(name))[1] = hz_current_tenant_id()::text
  );
create policy storage_property_delete on storage.objects
  for delete using (
    bucket_id = 'property-media'
    and (storage.foldername(name))[1] = hz_current_tenant_id()::text
    and hz_role_in_tenant(hz_current_tenant_id()) in ('owner','manager')
  );

insert into hz_schema_meta(key, value) values ('migration', '202609040010_rls_property_stack');
