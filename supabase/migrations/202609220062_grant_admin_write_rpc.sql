-- 202609220062 — Grant EXECUTE on admin write RPCs to `authenticated`.
--
-- Root cause of the "reset password does nothing" production bug (reported
-- 2026-09-22): migration 059 revoked EXECUTE on every admin_* function from
-- `public, anon`, but only re-granted the three READ functions
-- (admin_stats, admin_list_users, admin_tenants_overview) to `authenticated`.
-- Every WRITE RPC therefore failed with
--   "permission denied for function admin_set_user_password"
-- (and the same would hit create/delete user, assign/unassign,
--  create/update/delete tenant, set plan).
--
-- Security posture unchanged: each function still enforces
-- hz_is_super_admin() internally (migration 060: requires a verified MFA /
-- AAL2 session), and anon stays explicitly revoked.

grant execute on function admin_create_user(text, text, text, text)              to authenticated;
grant execute on function admin_update_user(uuid, text, text)                    to authenticated;
grant execute on function admin_set_user_password(uuid, text)                    to authenticated;
grant execute on function admin_delete_user(uuid)                                to authenticated;
grant execute on function admin_assign_user_to_tenant(uuid, uuid, user_role)     to authenticated;
grant execute on function admin_remove_user_from_tenant(uuid)                    to authenticated;
grant execute on function admin_create_tenant(text, text, text, text, text)      to authenticated;
grant execute on function admin_update_tenant(uuid, text, text, tenant_status, text, text, text) to authenticated;
grant execute on function admin_delete_tenant(uuid)                              to authenticated;
grant execute on function admin_set_tenant_plan(uuid, text)                      to authenticated;

insert into hz_schema_meta(key, value)
values ('migration', '202609220062_grant_admin_write_rpc');
