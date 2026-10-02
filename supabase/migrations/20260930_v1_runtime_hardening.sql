-- CMIP V1 runtime hardening.
-- Apply only to the authorized CMIPtst environment first and validate before production.

begin;

-- Falha cedo e de forma atômica se o CMIPtst não estiver no contrato V1 esperado.
do $$
begin
  if to_regclass('public.medical_queue') is null
     or to_regclass('public.patient_calls') is null
     or to_regclass('public.ticket_calls') is null
     or to_regclass('public.doctor_sessions') is null
     or to_regclass('public.offices') is null
     or to_regclass('public.patients') is null then
    raise exception 'CMIP V1 hardening preflight failed: tabelas operacionais esperadas estão ausentes';
  end if;
  if to_regprocedure('private.current_doctor_id()') is null
     or to_regprocedure('private.is_operational_superuser()') is null then
    raise exception 'CMIP V1 hardening preflight failed: aplique primeiro as migrations V1 anteriores';
  end if;
  if to_regprocedure('public.get_display_state(text)') is null then
    raise exception 'CMIP V1 hardening preflight failed: public.get_display_state(text) não existe';
  end if;
end
$$;

create or replace function private.enforce_medical_queue_transition()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  from_status text := old.status::text;
  to_status text := new.status::text;
begin
  if from_status = to_status then
    return new;
  end if;

  if not (
    (from_status = 'waiting' and to_status in ('called','absent','cancelled')) or
    (from_status = 'called' and to_status in ('in_service','absent','waiting','cancelled')) or
    (from_status = 'in_service' and to_status in ('finished')) or
    (from_status = 'absent' and to_status in ('waiting','cancelled'))
  ) then
    raise exception 'Transição de fila inválida: % -> %', from_status, to_status using errcode='23514';
  end if;

  return new;
end
$$;

drop trigger if exists trg_medical_queue_transition on public.medical_queue;
create trigger trg_medical_queue_transition
before update of status on public.medical_queue
for each row execute function private.enforce_medical_queue_transition();

create or replace function private.guard_patient_call_insert()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  queue_status text;
begin
  select q.status::text into queue_status
  from public.medical_queue q
  where q.id = new.queue_id;

  if queue_status is null then
    raise exception 'Fila da chamada não encontrada' using errcode='23503';
  end if;

  if new.call_kind::text = 'call' and queue_status <> 'waiting' then
    raise exception 'Chamada inicial permitida somente para paciente aguardando' using errcode='23514';
  end if;

  if new.call_kind::text = 'recall' and queue_status <> 'called' then
    raise exception 'Rechamada permitida somente após uma chamada inicial' using errcode='23514';
  end if;

  if exists (
    select 1 from public.patient_calls pc
    where pc.queue_id = new.queue_id
      and pc.call_kind = new.call_kind
      and pc.called_at >= now() - interval '2 seconds'
  ) then
    raise exception 'Chamada duplicada bloqueada' using errcode='23505';
  end if;

  return new;
end
$$;

drop trigger if exists trg_patient_calls_guard on public.patient_calls;
create trigger trg_patient_calls_guard
before insert on public.patient_calls
for each row execute function private.guard_patient_call_insert();

create or replace function public.get_latest_medical_call_event(p_queue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  current_doctor uuid;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;

  if not private.is_operational_superuser() then
    current_doctor := private.current_doctor_id();
    if current_doctor is null or not exists (
      select 1 from public.medical_queue q
      where q.id = p_queue_id and q.doctor_id = current_doctor
    ) then
      raise exception 'Acesso negado à chamada médica' using errcode='42501';
    end if;
  end if;

  select jsonb_build_object(
    'event_key', 'm' || pc.id::text,
    'kind', 'medical',
    'patient_name', p.full_name,
    'destination', o.name,
    'at', pc.called_at,
    'queue_id', q.id,
    'office_id', o.id
  )
  into result
  from public.patient_calls pc
  join public.medical_queue q on q.id = pc.queue_id
  join public.patients p on p.id = q.patient_id
  join public.doctor_sessions ds on ds.id = pc.doctor_session_id
  join public.offices o on o.id = ds.office_id
  where pc.queue_id = p_queue_id
  order by pc.called_at desc
  limit 1;

  return result;
end
$$;

revoke all on function public.get_latest_medical_call_event(uuid) from public,anon,authenticated;
grant execute on function public.get_latest_medical_call_event(uuid) to authenticated;

-- Ensure TV recovery events are available through Realtime when not already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='ticket_calls'
  ) then
    alter publication supabase_realtime add table public.ticket_calls;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='patient_calls'
  ) then
    alter publication supabase_realtime add table public.patient_calls;
  end if;
end
$$;


create or replace function private.mask_public_patient_name(p_name text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  parts text[];
begin
  if p_name is null or btrim(p_name) = '' then
    return 'Paciente';
  end if;
  parts := regexp_split_to_array(btrim(p_name), '\s+');
  if coalesce(array_length(parts,1),0) <= 1 then
    return parts[1];
  end if;
  return parts[1] || ' ' || upper(left(parts[array_length(parts,1)],1)) || '.';
end
$$;

create or replace function public.get_public_display_state(p_panel_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  state jsonb;
  current_event jsonb;
  history_events jsonb;
begin
  state := public.get_display_state(p_panel_slug);
  if state is null then
    return null;
  end if;

  current_event := state->'current';
  if current_event is not null and current_event->>'kind' = 'medical' then
    current_event := jsonb_set(
      current_event,
      '{patient_name}',
      to_jsonb(private.mask_public_patient_name(current_event->>'patient_name')),
      true
    );
  end if;

  select coalesce(
    jsonb_agg(
      case
        when item->>'kind' = 'medical' then jsonb_set(
          item,
          '{patient_name}',
          to_jsonb(private.mask_public_patient_name(item->>'patient_name')),
          true
        )
        else item
      end
    ),
    '[]'::jsonb
  )
  into history_events
  from jsonb_array_elements(coalesce(state->'history','[]'::jsonb)) item;

  return jsonb_set(
    jsonb_set(state,'{current}',coalesce(current_event,'null'::jsonb),true),
    '{history}',history_events,true
  );
end
$$;

revoke all on function public.get_public_display_state(text) from public,anon,authenticated;
grant execute on function public.get_public_display_state(text) to anon,authenticated;

-- TVs públicas recebem apenas o estado sanitizado. A versão completa permanece autenticada.
revoke execute on function public.get_display_state(text) from anon;
grant execute on function public.get_display_state(text) to authenticated;

commit;
