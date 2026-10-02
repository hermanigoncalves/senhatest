-- CMIPtst — correção do modo médico delegado
-- Objetivo: permitir que Admin/Master opere um médico ativo mesmo quando o próprio
-- médico ainda está obrigado a trocar a senha no primeiro login.
-- must_change_password protege o login do médico; não deve bloquear a delegação auditada.

begin;

create or replace function private.assert_active_delegated_doctor(p_doctor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_operational_superuser();
  if p_doctor_id is null or not exists (
    select 1
    from public.doctors d
    join public.profiles p on p.id=d.profile_id
    where d.id=p_doctor_id
      and d.active
      and p.active
      and p.role='doctor'
  ) then
    raise exception 'Médico delegado inexistente ou inativo' using errcode='42501';
  end if;
end
$$;

create or replace function public.admin_list_delegable_doctors()
returns table(doctor_id uuid,doctor_name text,specialty text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_operational_superuser();
  return query
  select d.id,p.full_name,d.specialty
  from public.doctors d
  join public.profiles p on p.id=d.profile_id
  where d.active and p.active and p.role='doctor'
  order by p.full_name;
end
$$;

revoke all on function private.assert_active_delegated_doctor(uuid) from public,anon,authenticated;
revoke all on function public.admin_list_delegable_doctors() from public,anon,authenticated;
grant execute on function public.admin_list_delegable_doctors() to authenticated;

commit;
