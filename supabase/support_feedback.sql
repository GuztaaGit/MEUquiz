-- Execute uma vez no SQL Editor do Supabase.
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null, user_email text not null,
  subject text not null check (char_length(subject) between 1 and 120),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_reply text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.feedback_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null, user_email text not null,
  rating smallint not null check (rating between 1 and 5),
  message text not null check (char_length(message) between 5 and 1200),
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);
create index if not exists feedback_entries_created_idx on public.feedback_entries(created_at desc);
alter table public.support_tickets enable row level security;
alter table public.feedback_entries enable row level security;

revoke all on public.support_tickets from anon, authenticated;
revoke all on public.feedback_entries from anon, authenticated;
grant select, insert, update, delete on public.support_tickets to service_role;
grant select, insert, update, delete on public.feedback_entries to service_role;
grant usage, select on sequence public.support_tickets_id_seq to service_role;
grant usage, select on sequence public.feedback_entries_id_seq to service_role;
