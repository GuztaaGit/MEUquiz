-- Execute uma vez no SQL Editor do Supabase.
-- Habilita o silenciamento temporário de usuários no Chat Global.
alter table public.profiles
  add column if not exists chat_muted_until timestamptz;
