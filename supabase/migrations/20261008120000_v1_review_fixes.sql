-- CMIP V1 — correções da revisão de código (2026-10-08).
-- NÃO aplicada em nenhum ambiente. Aplicar primeiro no CMIPtst (echypqclxnztvjicnkbf), validar e só então promover.
-- Idempotente: pode ser executada mais de uma vez.
--
-- Conteúdo:
--  1. Tabela de auditoria das operações administrativas de usuários (usada pela Edge Function master-user-admin).
--  2. Trava por fila no bloqueio de chamada duplicada (evita corrida entre inserts simultâneos).
--  3. admin_get_doctor_queue sem linhas duplicadas quando houver mais de uma sessão ativa do médico.
--  4. get_public_display_state devolve somente os campos que a TV usa (lista de permissão).

begin;

-- Falha cedo se o contrato esperado não existir.
do $$
begin
  if to_regclass('public.medical_queue') is null
     or to_regclass('public.patient_calls') is null
     or to_regclass('public.doctor_sessions') is null
     or to_regclass('public.offices') is null
     or to_regclass('public.patients') is null then
    raise exception 'preflight: tabelas operacionais ausentes';
  end if;
  if to_regprocedure('private.is_operational_superuser()') is null
     or to_regprocedure('private.assert_active_delegated_doctor(uuid)') is null then
    raise exception 'preflight: aplique antes 20260929_admin_master_operational_superusers.sql';
  end if;
  if to_regprocedure('public.get_display_state(text)') is null then
    raise exception 'preflight: public.get_display_state(text) não existe';
  end if;
end
$$;

-- 1. Auditoria de operações administrativas de usuários -------------------------------------------------
create table if not exists public.admin_user_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  target_user_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_user_audit enable row level security;
drop policy if exists admin_user_audit_superuser_select on public.admin_user_audit;
create policy admin_user_audit_superuser_select
  on public.admin_user_audit for select to authenticated
  using (private.is_operational_superuser());

-- Escrita apenas pela Edge Function (service_role); nenhum acesso de escrita para anon/authenticated.
revoke all on table public.admin_user_audit from public, anon, authenticated;
grant select on table public.admin_user_audit to authenticated;

-- 2. Bloqueio de chamada duplicada com trava por fila ----------------------------------------------------
create or replace function private.guard_patient_call_insert()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  queue_status text;
begin
  -- Serializa inserts concorrentes da mesma fila: o segundo só prossegue depois do commit do primeiro e,
  -- então, enxerga a chamada recém-criada na checagem de duplicidade abaixo.
  perform pg_advisory_xact_lock(hashtextextended('patient_call:' || new.queue_id::text, 0));

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

-- 3. Fila delegada sem duplicação por sessões ativas repetidas -------------------------------------------
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
  left join lateral (
    select s.office_id
    from public.doctor_sessions s
    where s.doctor_id=q.doctor_id and s.status='active'
    order by s.started_at desc
    limit 1
  ) active_session on true
  left join public.offices o on o.id=active_session.office_id
  where q.doctor_id=p_doctor_id and q.status not in ('finished','cancelled')
  order by q.created_at;
end
$$;

revoke all on function public.admin_get_doctor_queue(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_doctor_queue(uuid) to authenticated;

-- 4. Estado público da TV: lista de permissão de campos ---------------------------------------------------
create or replace function private.public_display_event(item jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  cleaned jsonb;
begin
  if item is null or jsonb_typeof(item) <> 'object' then
    return null;
  end if;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  into cleaned
  from jsonb_each(item) as e
  where e.key = any (array['event_key','id','kind','is_recall','display_number','patient_name','destination','at']);

  if cleaned->>'kind' = 'medical' then
    cleaned := jsonb_set(cleaned, '{patient_name}', to_jsonb(private.mask_public_patient_name(cleaned->>'patient_name')), true);
  end if;

  return cleaned;
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
  history_events jsonb;
begin
  state := public.get_display_state(p_panel_slug);
  if state is null then
    return null;
  end if;

  select coalesce(jsonb_agg(t.ev), '[]'::jsonb)
  into history_events
  from (
    select private.public_display_event(item) as ev
    from jsonb_array_elements(coalesce(state->'history','[]'::jsonb)) item
  ) t
  where t.ev is not null;

  return jsonb_build_object(
    'panel', case when state->'panel' is null or jsonb_typeof(state->'panel') <> 'object' then null
                  else jsonb_build_object('code', state->'panel'->'code', 'name', state->'panel'->'name') end,
    'current', private.public_display_event(state->'current'),
    'history', history_events
  );
end
$$;

revoke all on function public.get_public_display_state(text) from public,anon,authenticated;
grant execute on function public.get_public_display_state(text) to anon,authenticated;

commit;
