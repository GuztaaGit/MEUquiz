-- Execute uma vez no SQL Editor do Supabase.
-- Habilita o silenciamento temporário de usuários no Chat Global.
alter table public.profiles
  add column if not exists chat_muted_until timestamptz;

grant select on public.profiles to service_role;
grant update (chat_muted_until, updated_at)
on public.profiles to service_role;
