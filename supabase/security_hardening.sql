-- Endurecimento de segurança e pequenos ajustes de desempenho.
-- Seguro para executar novamente no projeto existente.

drop policy if exists "Usuário lê o próprio perfil" on public.profiles;
create policy "Usuário lê o próprio perfil"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

revoke all on function public.handle_new_user() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

create index if not exists community_messages_user_idx
on public.community_messages(user_id);

create index if not exists feedback_entries_user_idx
on public.feedback_entries(user_id);

create index if not exists payment_grants_user_idx
on public.payment_grants(user_id);
