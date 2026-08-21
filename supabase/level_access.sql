-- Controle administrativo de acesso aos 60 níveis do ElectroLearn.
-- Execute uma vez no SQL Editor do Supabase. É seguro executar novamente.

alter table public.profiles
  add column if not exists level_access_mode text not null default 'progressive';

alter table public.profiles
  add column if not exists level_access_levels jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_level_access_mode_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_level_access_mode_check
      check (level_access_mode in ('progressive', 'all', 'custom', 'blocked'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_level_access_levels_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_level_access_levels_check
      check (jsonb_typeof(level_access_levels) = 'array');
  end if;
end $$;

update public.profiles
set
  level_access_mode = 'progressive',
  level_access_levels = '[]'::jsonb
where level_access_mode is null
   or level_access_mode not in ('progressive', 'all', 'custom', 'blocked')
   or jsonb_typeof(level_access_levels) is distinct from 'array';

grant select on public.profiles to service_role;
grant update (level_access_mode, level_access_levels, updated_at)
on public.profiles to service_role;
