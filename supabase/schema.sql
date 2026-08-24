-- Execute este arquivo no SQL Editor do Supabase antes de publicar.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive', 'active', 'cancelled')),
  subscription_plan text check (subscription_plan in ('weekly', 'monthly')),
  access_until timestamptz,
  asaas_subscription_id text,
  score integer not null default 0 check (score >= 0),
  progress jsonb not null default '{}'::jsonb,
  lesson_progress jsonb not null default '{}'::jsonb
    check (jsonb_typeof(lesson_progress) = 'object'),
  quiz_scores jsonb not null default '{}'::jsonb
    check (jsonb_typeof(quiz_scores) = 'object'),
  ranking_visible boolean not null default true,
  level_access_mode text not null default 'progressive'
    check (level_access_mode in ('progressive', 'all', 'custom', 'blocked')),
  level_access_levels jsonb not null default '[]'::jsonb
    check (jsonb_typeof(level_access_levels) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_grants (
  payment_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('weekly', 'monthly')),
  event text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.payment_grants enable row level security;

drop policy if exists "Usuário lê o próprio perfil" on public.profiles;
create policy "Usuário lê o próprio perfil"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

-- A função é acionada somente pelo trigger do Auth. Ela não deve ficar
-- disponível como RPC para visitantes ou usuários autenticados.
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Migração segura para projetos que já possuem a tabela profiles.
alter table public.profiles add column if not exists score integer not null default 0;
alter table public.profiles add column if not exists progress jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists lesson_progress jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists quiz_scores jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists ranking_visible boolean not null default true;
alter table public.profiles add column if not exists chat_muted_until timestamptz;
alter table public.profiles add column if not exists level_access_mode text not null default 'progressive';
alter table public.profiles add column if not exists level_access_levels jsonb not null default '[]'::jsonb;

update public.profiles set lesson_progress = '{}'::jsonb
where lesson_progress is null or jsonb_typeof(lesson_progress) is distinct from 'object';
update public.profiles set quiz_scores = '{}'::jsonb
where quiz_scores is null or jsonb_typeof(quiz_scores) is distinct from 'object';
alter table public.profiles
  alter column lesson_progress set default '{}'::jsonb,
  alter column lesson_progress set not null,
  alter column quiz_scores set default '{}'::jsonb,
  alter column quiz_scores set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_level_access_mode_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_level_access_mode_check
      check (level_access_mode in ('progressive', 'all', 'custom', 'blocked'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_level_access_levels_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_level_access_levels_check
      check (jsonb_typeof(level_access_levels) = 'array');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_lesson_progress_object_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_lesson_progress_object_check
      check (jsonb_typeof(lesson_progress) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_quiz_scores_object_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_quiz_scores_object_check
      check (jsonb_typeof(quiz_scores) = 'object');
  end if;
end $$;

create table if not exists public.community_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_messages (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  author_name text not null,
  message text not null check (char_length(message) between 1 and 600),
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);

-- Migração segura caso a tabela do chat já tenha sido criada.
alter table public.community_messages alter column user_id drop not null;
alter table public.community_messages add column if not exists is_bot boolean not null default false;

create index if not exists community_messages_created_idx on public.community_messages(created_at desc);
create index if not exists community_messages_user_idx on public.community_messages(user_id);
create index if not exists community_presence_updated_idx on public.community_presence(updated_at desc);
alter table public.community_presence enable row level security;
alter table public.community_messages enable row level security;

create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  user_email text not null,
  subject text not null check (char_length(subject) between 1 and 120),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  user_email text not null,
  rating smallint not null check (rating between 1 and 5),
  message text not null check (char_length(message) between 5 and 1200),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);
create index if not exists feedback_entries_created_idx on public.feedback_entries(created_at desc);
create index if not exists feedback_entries_user_idx on public.feedback_entries(user_id);
create index if not exists payment_grants_user_idx on public.payment_grants(user_id);
alter table public.support_tickets enable row level security;
alter table public.feedback_entries enable row level security;

-- O navegador usa somente o Auth do Supabase. As tabelas de negócio são
-- acessadas pelo backend com service_role e RLS permanece habilitado.
revoke all on public.payment_grants, public.community_presence,
  public.community_messages, public.support_tickets, public.feedback_entries
from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles, public.payment_grants,
  public.community_presence, public.community_messages,
  public.support_tickets, public.feedback_entries
to service_role;
grant usage, select on all sequences in schema public to service_role;
