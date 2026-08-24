-- Progresso confiável por aula e por quiz.
-- Execute uma vez no SQL Editor do Supabase. É seguro executar novamente.

alter table public.profiles
  add column if not exists lesson_progress jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists quiz_scores jsonb not null default '{}'::jsonb;

update public.profiles
set lesson_progress = '{}'::jsonb
where lesson_progress is null or jsonb_typeof(lesson_progress) is distinct from 'object';

update public.profiles
set quiz_scores = '{}'::jsonb
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

alter table public.profiles enable row level security;

grant select on public.profiles to service_role;
grant update (score, progress, lesson_progress, quiz_scores, updated_at)
on public.profiles to service_role;
