-- READ-ONLY AUDIT: run in the Supabase SQL editor with an authorized owner.
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('picks','rounds','players');
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public';
select p.oid::regprocedure, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='is_admin';
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema='public' order by table_name,grantee;

-- PROPOSED ONLY: do NOT execute until is_admin() and its backing table are audited.
-- is_admin() must check auth.uid() against a protected admin allowlist (or trusted
-- server-managed app_metadata), never user_metadata or a client-supplied flag.
-- The admin allowlist must not be writable by anon/authenticated users.
-- Existing permissive UPDATE/SELECT policies must also authorize the admin.
-- A restrictive policy intersects existing permissive policies; it does not
-- accidentally widen access. Audit INSERT/DELETE, RPCs, views and service-role
-- endpoints too: an UPDATE policy alone cannot secure alternative write paths.
/*
begin;
alter table public.picks enable row level security;
create policy picks_admin_update_guard on public.picks
as restrictive for update to public
using (auth.uid() is not null and public.is_admin() is true)
with check (auth.uid() is not null and public.is_admin() is true);
commit;
*/
