-- Applied to CMIPtst (echypqclxnztvjicnkbf). Never run blindly in production.
-- Presence model: 15s frontend heartbeat, 45s backend availability window.
alter table public.doctor_sessions add column if not exists last_seen_at timestamptz;

create or replace function public.doctor_heartbeat()
returns timestamptz language plpgsql security definer set search_path='' as $$
declare did uuid; ts timestamptz;
begin
  perform private.assert_roles(array['doctor']::public.user_role[]);
  did:=private.current_doctor_id();
  if did is null then raise exception 'Médico autenticado não encontrado'; end if;
  update public.doctor_sessions set last_seen_at=now()
  where doctor_id=did and status='active' returning last_seen_at into ts;
  if ts is null then raise exception 'Sessão médica ativa não encontrada'; end if;
  return ts;
end$$;
revoke all on function public.doctor_heartbeat() from public,anon,authenticated;
grant execute on function public.doctor_heartbeat() to authenticated;

create or replace function public.list_available_doctors()
returns table(doctor_id uuid,doctor_name text,specialty text,office_id uuid,office_name text)
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.assert_roles(array['master','admin','receptionist']::public.user_role[]);
  return query select d.id,p.full_name,d.specialty,o.id,o.name
  from public.doctors d join public.profiles p on p.id=d.profile_id
  join public.doctor_sessions s on s.doctor_id=d.id and s.status='active'
  join public.offices o on o.id=s.office_id
  where d.active and p.active and not p.must_change_password and o.active
    and s.last_seen_at is not null and s.last_seen_at>=now()-interval '45 seconds'
  order by p.full_name;
end$$;

create or replace function public.available_offices()
returns table(id uuid,name text)
language plpgsql security definer set search_path='' as $$
declare did uuid;
begin
  perform private.assert_roles(array['doctor']::public.user_role[]);
  did:=private.current_doctor_id();
  return query select o.id,o.name from public.offices o where o.active and not exists(
    select 1 from public.doctor_sessions s where s.office_id=o.id and s.status='active'
      and s.doctor_id<>did and s.last_seen_at is not null and s.last_seen_at>=now()-interval '45 seconds'
  ) order by o.name;
end$$;

-- start_doctor_session in CMIPtst was also updated to set last_seen_at=now(),
-- revive the authenticated doctor's own active session, and finish stale occupants
-- before enforcing the unique active-office invariant.
-- get_my_doctor_session now returns last_seen_at as an additional column.
-- end_doctor_session remains immediate and identity-derived.
