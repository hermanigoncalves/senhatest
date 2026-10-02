-- MANUAL APPLY ONLY — target: CMIPtst (echypqclxnztvjicnkbf).
-- Do not run in production. Review the preflight output and execute this file as
-- a single transaction only after confirming the target project in Supabase.

begin;

-- Fail closed when the remote schema differs from the UUID-based CMIPtst contract.
do $preflight$
declare
  required_table text;
  required_column record;
begin
  if current_database() is null then
    raise exception 'Database context unavailable';
  end if;

  foreach required_table in array array[
    'profiles','doctors','offices','doctor_sessions','patients','service_points',
    'ticket_calls','medical_queue','queue_history','display_panels',
    'display_panel_offices','display_panel_service_points','patient_calls',
    'patient_call_displays'
  ] loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'CMIPtst preflight failed: missing public.%', required_table;
    end if;
  end loop;

  if to_regtype('public.user_role') is null or to_regtype('public.queue_status') is null then
    raise exception 'CMIPtst preflight failed: user_role or queue_status type is missing';
  end if;

  for required_column in
    select * from (values
      ('profiles','id','uuid'),('profiles','role','user_role'),
      ('doctors','id','uuid'),('doctors','profile_id','uuid'),
      ('offices','id','uuid'),('doctor_sessions','id','uuid'),
      ('doctor_sessions','doctor_id','uuid'),('doctor_sessions','office_id','uuid'),
      ('medical_queue','id','uuid'),('medical_queue','patient_id','uuid'),
      ('medical_queue','doctor_id','uuid'),('patient_calls','id','uuid')
    ) as expected(table_name,column_name,udt_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public'
        and c.table_name=required_column.table_name
        and c.column_name=required_column.column_name
        and c.udt_name=required_column.udt_name
    ) then
      raise exception 'CMIPtst preflight failed: %.% must use %',
        required_column.table_name, required_column.column_name, required_column.udt_name;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('profiles','active'),('profiles','must_change_password'),('profiles','full_name'),
      ('doctors','active'),('doctors','specialty'),
      ('offices','active'),('offices','name'),
      ('doctor_sessions','status'),('doctor_sessions','started_at'),
      ('doctor_sessions','ended_at'),('doctor_sessions','last_seen_at'),
      ('doctor_sessions','created_by'),
      ('patients','full_name'),
      ('medical_queue','status'),('medical_queue','created_by'),
      ('medical_queue','created_at'),('medical_queue','updated_at'),
      ('queue_history','queue_id'),('queue_history','event'),
      ('queue_history','from_status'),('queue_history','to_status'),
      ('queue_history','previous_doctor_id'),('queue_history','new_doctor_id'),
      ('queue_history','performed_by'),
      ('patient_calls','queue_id'),('patient_calls','doctor_session_id'),
      ('patient_calls','call_kind'),('patient_calls','called_by'),
      ('patient_call_displays','patient_call_id'),
      ('display_panel_offices','office_id')
    ) as expected(table_name,column_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public'
        and c.table_name=required_column.table_name
        and c.column_name=required_column.column_name
    ) then
      raise exception 'CMIPtst preflight failed: missing %.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='patient_call_displays'
      and c.column_name in ('display_panel_id','panel_id')
  ) or not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='display_panel_offices'
      and c.column_name in ('display_panel_id','panel_id')
  ) then
    raise exception 'CMIPtst preflight failed: unsupported display-panel link columns';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='current_doctor_id'
  ) then
    raise exception 'CMIPtst preflight failed: private.current_doctor_id() is missing';
  end if;

  if exists (
    select 1 from pg_tables
    where schemaname='public'
      and tablename in ('doctors','offices','doctor_sessions','patients','service_points',
        'ticket_calls','medical_queue','queue_history','display_panels',
        'display_panel_offices','display_panel_service_points','patient_calls',
        'patient_call_displays')
      and not rowsecurity
  ) then
    raise exception 'CMIPtst preflight failed: an operational table has RLS disabled';
  end if;
end
$preflight$;

create or replace function private.is_operational_superuser()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.active
      and not p.must_change_password
      and p.role in ('admin','master')
  )
$$;

create or replace function private.assert_operational_superuser()
returns public.user_role
language plpgsql
stable
security definer
set search_path=''
as $$
declare actor_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id=auth.uid() and p.active and not p.must_change_password;

  if actor_role is null or actor_role not in ('admin','master') then
    raise exception 'Operação permitida somente para Admin ou Master' using errcode='42501';
  end if;

  return actor_role;
end
$$;

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

revoke all on function private.is_operational_superuser() from public,anon;
revoke all on function private.assert_operational_superuser() from public,anon,authenticated;
revoke all on function private.assert_active_delegated_doctor(uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_operational_superuser() to authenticated;

create table if not exists public.delegated_medical_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id),
  doctor_id uuid not null references public.doctors(id),
  action text not null,
  queue_id uuid references public.medical_queue(id),
  patient_id uuid references public.patients(id),
  office_id uuid references public.offices(id),
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.delegated_medical_audit enable row level security;
drop policy if exists delegated_medical_audit_superuser_select on public.delegated_medical_audit;
create policy delegated_medical_audit_superuser_select
  on public.delegated_medical_audit for select to authenticated
  using (private.is_operational_superuser());

revoke all on table public.delegated_medical_audit from public,anon,authenticated;
grant select on table public.delegated_medical_audit to authenticated;

-- Supplemental read policies. Existing policies remain untouched and RLS remains enabled.
do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'doctors','offices','doctor_sessions','patients','service_points','ticket_calls',
    'medical_queue','queue_history','display_panels','display_panel_offices',
    'display_panel_service_points','patient_calls','patient_call_displays'
  ] loop
    execute format('drop policy if exists cmip_operational_superusers_select on public.%I', table_name);
    execute format(
      'create policy cmip_operational_superusers_select on public.%I for select to authenticated using (private.is_operational_superuser())',
      table_name
    );
  end loop;
end
$policies$;

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

create or replace function public.admin_enqueue_patient(p_patient_id uuid,p_doctor_id uuid)
returns public.medical_queue
language plpgsql
security definer
set search_path=''
as $$
declare q public.medical_queue%rowtype;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  if not exists (select 1 from public.patients p where p.id=p_patient_id) then
    raise exception 'Paciente não encontrado';
  end if;

  insert into public.medical_queue(patient_id,doctor_id,created_by)
  values(p_patient_id,p_doctor_id,auth.uid()) returning * into q;

  insert into public.queue_history(queue_id,event,to_status,new_doctor_id,performed_by)
  values(q.id,'enqueued','waiting',p_doctor_id,auth.uid());

  insert into public.delegated_medical_audit(
    actor_user_id,doctor_id,action,queue_id,patient_id,to_status
  ) values(auth.uid(),p_doctor_id,'enqueue',q.id,p_patient_id,'waiting');
  return q;
end
$$;

create or replace function public.admin_available_offices(p_doctor_id uuid)
returns table(id uuid,name text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  return query
  select o.id,o.name
  from public.offices o
  where o.active and not exists (
    select 1 from public.doctor_sessions s
    where s.office_id=o.id and s.status='active' and s.doctor_id<>p_doctor_id
      and s.last_seen_at is not null and s.last_seen_at>=now()-interval '45 seconds'
  )
  order by o.name;
end
$$;

create or replace function public.admin_get_doctor_session(p_doctor_id uuid)
returns table(session_id uuid,doctor_id uuid,office_id uuid,office_name text,last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  return query
  select s.id,s.doctor_id,s.office_id,o.name,s.last_seen_at
  from public.doctor_sessions s
  join public.offices o on o.id=s.office_id
  where s.doctor_id=p_doctor_id and s.status='active'
  order by s.started_at desc
  limit 1;
end
$$;

create or replace function public.admin_start_doctor_session(p_doctor_id uuid,p_office_id uuid)
returns public.doctor_sessions
language plpgsql
security definer
set search_path=''
as $$
declare s public.doctor_sessions%rowtype;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  if not exists (select 1 from public.offices o where o.id=p_office_id and o.active) then
    raise exception 'Consultório inexistente ou inativo';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_office_id::text,0));

  update public.doctor_sessions
  set status='ended',ended_at=coalesce(ended_at,now())
  where office_id=p_office_id and status='active' and doctor_id<>p_doctor_id
    and (last_seen_at is null or last_seen_at<now()-interval '45 seconds');

  if exists (
    select 1 from public.doctor_sessions
    where office_id=p_office_id and status='active' and doctor_id<>p_doctor_id
  ) then
    raise exception 'Consultório ocupado' using errcode='23505';
  end if;

  update public.doctor_sessions
  set last_seen_at=now()
  where doctor_id=p_doctor_id and office_id=p_office_id and status='active'
  returning * into s;

  if s.id is null then
    update public.doctor_sessions
    set status='ended',ended_at=coalesce(ended_at,now())
    where doctor_id=p_doctor_id and status='active';

    insert into public.doctor_sessions(doctor_id,office_id,status,last_seen_at,created_by)
    values(p_doctor_id,p_office_id,'active',now(),auth.uid())
    returning * into s;
  end if;

  insert into public.delegated_medical_audit(actor_user_id,doctor_id,action,office_id)
  values(auth.uid(),p_doctor_id,'start_session',p_office_id);
  return s;
end
$$;

create or replace function public.admin_end_doctor_session(p_doctor_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare ended_office_id uuid;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  update public.doctor_sessions
  set status='ended',ended_at=coalesce(ended_at,now())
  where doctor_id=p_doctor_id and status='active'
  returning office_id into ended_office_id;

  if ended_office_id is not null then
    insert into public.delegated_medical_audit(actor_user_id,doctor_id,action,office_id)
    values(auth.uid(),p_doctor_id,'end_session',ended_office_id);
  end if;
end
$$;

create or replace function public.admin_doctor_heartbeat(p_doctor_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare heartbeat_at timestamptz;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  update public.doctor_sessions set last_seen_at=now()
  where doctor_id=p_doctor_id and status='active'
  returning last_seen_at into heartbeat_at;
  if heartbeat_at is null then raise exception 'Sessão médica ativa não encontrada'; end if;
  return heartbeat_at;
end
$$;

create or replace function public.admin_get_doctor_queue(p_doctor_id uuid)
returns table(id uuid,patient_id uuid,patient_name text,status text,created_at timestamptz,office_name text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);
  return query
  select q.id,q.patient_id,p.full_name,q.status::text,q.created_at,o.name
  from public.medical_queue q
  join public.patients p on p.id=q.patient_id
  left join public.doctor_sessions s on s.doctor_id=q.doctor_id and s.status='active'
  left join public.offices o on o.id=s.office_id
  where q.doctor_id=p_doctor_id and q.status not in ('finished','cancelled')
  order by q.created_at;
end
$$;

create or replace function public.admin_doctor_queue_action(
  p_doctor_id uuid,p_queue_id uuid,p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.medical_queue%rowtype;
  s public.doctor_sessions%rowtype;
  patient_call public.patient_calls%rowtype;
  old_status public.queue_status;
  new_status public.queue_status;
  call_panel_column text;
  office_panel_column text;
begin
  perform private.assert_active_delegated_doctor(p_doctor_id);

  select * into q from public.medical_queue
  where id=p_queue_id and doctor_id=p_doctor_id for update;
  if q.id is null then
    raise exception 'Fila não pertence ao médico delegado' using errcode='42501';
  end if;

  old_status:=q.status;
  new_status:=case p_action
    when 'call' then 'called'
    when 'recall' then q.status
    when 'start' then 'in_service'
    when 'finish' then 'finished'
    when 'absent' then 'absent'
    when 'return' then 'waiting'
    else null
  end;
  if new_status is null then raise exception 'Ação médica inválida'; end if;

  if p_action in ('call','recall') then
    select * into s from public.doctor_sessions
    where doctor_id=p_doctor_id and status='active'
      and last_seen_at is not null and last_seen_at>=now()-interval '45 seconds'
    order by started_at desc limit 1;
    if s.id is null then raise exception 'Inicie uma sessão médica antes da chamada'; end if;

    insert into public.patient_calls(queue_id,doctor_session_id,call_kind,called_by)
    values(q.id,s.id,p_action,auth.uid()) returning * into patient_call;

    select case when exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='patient_call_displays' and column_name='display_panel_id'
    ) then 'display_panel_id' else 'panel_id' end into call_panel_column;
    select case when exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='display_panel_offices' and column_name='display_panel_id'
    ) then 'display_panel_id' else 'panel_id' end into office_panel_column;

    execute format(
      'insert into public.patient_call_displays(patient_call_id,%I) select $1,dpo.%I from public.display_panel_offices dpo where dpo.office_id=$2 on conflict do nothing',
      call_panel_column,office_panel_column
    ) using patient_call.id,s.office_id;
  end if;

  update public.medical_queue set status=new_status,updated_at=now()
  where id=q.id returning * into q;

  insert into public.queue_history(
    queue_id,event,from_status,to_status,previous_doctor_id,new_doctor_id,performed_by
  ) values(q.id,p_action,old_status,new_status,p_doctor_id,p_doctor_id,auth.uid());

  insert into public.delegated_medical_audit(
    actor_user_id,doctor_id,action,queue_id,patient_id,office_id,from_status,to_status
  ) values(
    auth.uid(),p_doctor_id,p_action,q.id,q.patient_id,s.office_id,
    old_status::text,new_status::text
  );
  return to_jsonb(q);
end
$$;

revoke all on function public.admin_list_delegable_doctors() from public,anon,authenticated;
revoke all on function public.admin_enqueue_patient(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_available_offices(uuid) from public,anon,authenticated;
revoke all on function public.admin_get_doctor_session(uuid) from public,anon,authenticated;
revoke all on function public.admin_start_doctor_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_end_doctor_session(uuid) from public,anon,authenticated;
revoke all on function public.admin_doctor_heartbeat(uuid) from public,anon,authenticated;
revoke all on function public.admin_get_doctor_queue(uuid) from public,anon,authenticated;
revoke all on function public.admin_doctor_queue_action(uuid,uuid,text) from public,anon,authenticated;

grant execute on function public.admin_list_delegable_doctors() to authenticated;
grant execute on function public.admin_enqueue_patient(uuid,uuid) to authenticated;
grant execute on function public.admin_available_offices(uuid) to authenticated;
grant execute on function public.admin_get_doctor_session(uuid) to authenticated;
grant execute on function public.admin_start_doctor_session(uuid,uuid) to authenticated;
grant execute on function public.admin_end_doctor_session(uuid) to authenticated;
grant execute on function public.admin_doctor_heartbeat(uuid) to authenticated;
grant execute on function public.admin_get_doctor_queue(uuid) to authenticated;
grant execute on function public.admin_doctor_queue_action(uuid,uuid,text) to authenticated;

commit;
