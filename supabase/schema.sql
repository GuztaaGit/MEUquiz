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
