-- Um mesmo usuário médico (ex.: login compartilhado "medico") pode ter um consultório aberto em cada aparelho.
--
-- Antes: um médico = uma sessão ativa (índice doctor_sessions_one_active_per_doctor). Abrir outro consultório
-- encerrava o anterior, então dois médicos com o mesmo login se derrubavam.
-- Agora: uma sessão ativa por CONSULTÓRIO (doctor_sessions_one_active_per_office continua valendo).
-- Heartbeat e encerramento recebem o consultório do aparelho. Sem ele (front antigo durante o deploy), o
-- comportamento é o de antes: o heartbeat vale para todas as sessões e o encerramento do médico fecha todas.
--
-- Base: definições lidas da produção (echypqclxnztvjicnkbf) em 2026-11-04 — coluna finished_at, status 'finished'.
-- (O arquivo 20260929 do repositório usa ended_at e está desatualizado em relação à produção.)
-- Aplicar ANTES do deploy do front que passa p_office_id. Rodar inteiro no SQL Editor. Idempotente.

begin;

do $$
begin
  if not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='doctor_sessions' and column_name='finished_at')
     or not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='doctor_sessions' and column_name='last_seen_at')
     or to_regprocedure('private.assert_roles(public.user_role[])') is null
     or to_regprocedure('private.current_doctor_id()') is null
     or to_regprocedure('private.assert_active_delegated_doctor(uuid)') is null
     or to_regclass('public.delegated_medical_audit') is null
     or to_regclass('public.doctor_sessions_one_active_per_office') is null then
    raise exception 'preflight: doctor_sessions/funções diferentes do esperado (produção 2026-11-04)';
  end if;
end
$$;

drop index if exists public.doctor_sessions_one_active_per_doctor;

-- Médico abre um consultório. Sessões dele em OUTROS consultórios continuam abertas (outros aparelhos).
create or replace function public.start_doctor_session(p_office_id uuid)
returns public.doctor_sessions
language plpgsql
security definer
set search_path=''
as $$
declare did uuid; s public.doctor_sessions;
begin
  perform private.assert_roles(array['doctor']::public.user_role[]);
  did:=private.current_doctor_id();
  if did is null then raise exception 'Médico autenticado não encontrado'; end if;
  if not exists(select 1 from public.offices where id=p_office_id and active) then
    raise exception 'Consultório inválido ou inativo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_office_id::text,0));

  -- Já aberto por este médico (recarga da página): só renova a presença.
  update public.doctor_sessions set last_seen_at=now()
  where doctor_id=did and office_id=p_office_id and status='active'
  returning * into s;
  if s.id is not null then return s; end if;

  update public.doctor_sessions set status='finished',finished_at=coalesce(finished_at,now())
  where office_id=p_office_id and status='active' and doctor_id<>did
    and (last_seen_at is null or last_seen_at<now()-interval '45 seconds');
  if exists(select 1 from public.doctor_sessions where office_id=p_office_id and status='active') then
    raise exception 'Consultório ocupado' using errcode='23505';
  end if;

  insert into public.doctor_sessions(doctor_id,office_id,status,last_seen_at)
  values(did,p_office_id,'active',now())
  returning * into s;
  return s;
exception when unique_violation then
  raise exception 'Consultório ocupado' using errcode='23505';
end
$$;

-- Sem p_office_id: fecha todas as sessões do médico (comportamento antigo).
drop function if exists public.end_doctor_session();
create or replace function public.end_doctor_session(p_office_id uuid default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare did uuid;
begin
  perform private.assert_roles(array['doctor']::public.user_role[]);
  did:=private.current_doctor_id();
  update public.doctor_sessions set status='finished',finished_at=now()
  where doctor_id=did and status='active' and (p_office_id is null or office_id=p_office_id);
end
$$;

-- Com várias sessões, "update ... returning into" daria erro de mais de uma linha: usa max().
drop function if exists public.doctor_heartbeat();
create or replace function public.doctor_heartbeat(p_office_id uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare did uuid; ts timestamptz;
begin
  perform private.assert_roles(array['doctor']::public.user_role[]);
  did:=private.current_doctor_id();
  if did is null then raise exception 'Médico autenticado não encontrado'; end if;
  with u as (
    update public.doctor_sessions set last_seen_at=now()
    where doctor_id=did and status='active' and (p_office_id is null or office_id=p_office_id)
    returning last_seen_at
  )
  select max(last_seen_at) into ts from u;
  if ts is null then raise exception 'Sessão médica ativa não encontrada'; end if;
  return ts;
end
$$;

-- Devolve todas as sessões abertas do médico; cada aparelho escolhe a do seu consultório.
create or replace function public.get_my_doctor_session()
returns table(session_id uuid, doctor_id uuid, office_id uuid, office_name text,
              started_at timestamptz, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
declare did uuid;
begin
  perform private.assert_roles(array['doctor']::public.user_role[]);
  did:=private.current_doctor_id();
  return query
  select s.id,s.doctor_id,s.office_id,o.name,s.started_at,s.last_seen_at
  from public.doctor_sessions s join public.offices o on o.id=s.office_id
  where s.doctor_id=did and s.status='active'
  order by s.started_at desc;
end
$$;

-- Admin/Master atuando como médico: mesmas regras, com auditoria.
create or replace function public.admin_start_doctor_session(p_doctor_id uuid, p_office_id uuid)
returns public.doctor_sessions
language plpgsql
security definer
set search_path=''
as $$
declare s public.doctor_sessions%rowtype;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  if not exists(select 1 from public.offices where id=p_office_id and active) then
    raise exception 'Consultório inexistente ou inativo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_office_id::text,0));

  update public.doctor_sessions set last_seen_at=now()
  where doctor_id=p_doctor_id and office_id=p_office_id and status='active'
  returning * into s;
  if s.id is not null then
    insert into public.delegated_medical_audit(actor_user_id,doctor_id,action,office_id,metadata)
    values(auth.uid(),p_doctor_id,'heartbeat_session',p_office_id,jsonb_build_object('session_id',s.id));
    return s;
  end if;

  update public.doctor_sessions set status='finished',finished_at=coalesce(finished_at,now())
  where office_id=p_office_id and status='active' and doctor_id<>p_doctor_id
    and (last_seen_at is null or last_seen_at<now()-interval '45 seconds');
  if exists(select 1 from public.doctor_sessions where office_id=p_office_id and status='active') then
    raise exception 'Consultório ocupado' using errcode='23505';
  end if;

  insert into public.doctor_sessions(doctor_id,office_id,status,last_seen_at)
  values(p_doctor_id,p_office_id,'active',now())
  returning * into s;

  insert into public.delegated_medical_audit(actor_user_id,doctor_id,action,office_id,metadata)
  values(auth.uid(),p_doctor_id,'start_session',p_office_id,jsonb_build_object('session_id',s.id));
  return s;
exception when unique_violation then
  raise exception 'Consultório ocupado' using errcode='23505';
end
$$;

-- Sem p_office_id: fecha só a sessão mais recente (comportamento antigo).
drop function if exists public.admin_end_doctor_session(uuid);
create or replace function public.admin_end_doctor_session(p_doctor_id uuid, p_office_id uuid default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare r record;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  for r in
    select id,office_id from public.doctor_sessions
    where doctor_id=p_doctor_id and status='active' and (p_office_id is null or office_id=p_office_id)
    order by started_at desc
    limit case when p_office_id is null then 1 end
    for update
  loop
    update public.doctor_sessions set status='finished',finished_at=coalesce(finished_at,now())
    where id=r.id;
    insert into public.delegated_medical_audit(actor_user_id,doctor_id,action,office_id,metadata)
    values(auth.uid(),p_doctor_id,'end_session',r.office_id,jsonb_build_object('session_id',r.id));
  end loop;
end
$$;

drop function if exists public.admin_doctor_heartbeat(uuid);
create or replace function public.admin_doctor_heartbeat(p_doctor_id uuid, p_office_id uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare heartbeat_at timestamptz;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  with u as (
    update public.doctor_sessions set last_seen_at=now()
    where doctor_id=p_doctor_id and status='active' and (p_office_id is null or office_id=p_office_id)
    returning last_seen_at
  )
  select max(last_seen_at) into heartbeat_at from u;
  if heartbeat_at is null then raise exception 'Sessão médica ativa não encontrada'; end if;
  return heartbeat_at;
end
$$;

create or replace function public.admin_get_doctor_session(p_doctor_id uuid)
returns table(session_id uuid, doctor_id uuid, office_id uuid, office_name text, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  return query
  select s.id,s.doctor_id,s.office_id,o.name,s.last_seen_at
  from public.doctor_sessions s join public.offices o on o.id=s.office_id
  where s.doctor_id=p_doctor_id and s.status='active'
  order by s.started_at desc;
end
$$;

revoke all on function public.start_doctor_session(uuid) from public,anon;
revoke all on function public.end_doctor_session(uuid) from public,anon;
revoke all on function public.doctor_heartbeat(uuid) from public,anon;
revoke all on function public.get_my_doctor_session() from public,anon;
revoke all on function public.admin_start_doctor_session(uuid,uuid) from public,anon;
revoke all on function public.admin_end_doctor_session(uuid,uuid) from public,anon;
revoke all on function public.admin_doctor_heartbeat(uuid,uuid) from public,anon;
revoke all on function public.admin_get_doctor_session(uuid) from public,anon;
grant execute on function public.start_doctor_session(uuid) to authenticated;
grant execute on function public.end_doctor_session(uuid) to authenticated;
grant execute on function public.doctor_heartbeat(uuid) to authenticated;
grant execute on function public.get_my_doctor_session() to authenticated;
grant execute on function public.admin_start_doctor_session(uuid,uuid) to authenticated;
grant execute on function public.admin_end_doctor_session(uuid,uuid) to authenticated;
grant execute on function public.admin_doctor_heartbeat(uuid,uuid) to authenticated;
grant execute on function public.admin_get_doctor_session(uuid) to authenticated;

-- A API (PostgREST) passa a enxergar as novas assinaturas na hora.
notify pgrst, 'reload schema';

commit;
