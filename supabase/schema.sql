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
  ranking_visible boolean not null default true,
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
using (auth.uid() = id);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Migração segura para projetos que já possuem a tabela profiles.
alter table public.profiles add column if not exists score integer not null default 0;
alter table public.profiles add column if not exists progress jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists ranking_visible boolean not null default true;

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
create index if not exists community_presence_updated_idx on public.community_presence(updated_at desc);
alter table public.community_presence enable row level security;
alter table public.community_messages enable row level security;
