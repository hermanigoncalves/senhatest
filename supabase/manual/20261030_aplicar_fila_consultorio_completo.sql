-- Script único: fila de consultório + nome do paciente + TVs (gerado em 2026-10-30).
-- Junta, NESTA ORDEM, as migrations 20261020 → 20261024150000 e o grant de is_active_user.
-- Todas são idempotentes: no projeto de teste, onde parte já foi aplicada, rodar de novo não causa dano.
-- Faça backup antes. Rode o arquivo inteiro de uma vez no SQL Editor.

-- ================================================================
-- 20261020120000_office_ticket_queue.sql
-- ================================================================
-- Fila de senhas por consultório, sem médico logado.
-- A recepção encaminha uma senha para um consultório (uma "caixa" por consultório) e chama a senha de lá;
-- a TV anuncia "Senha 0045 — Consultório 3". Não usa medical_queue (que exige médico).
-- NÃO aplicada em nenhum ambiente. Aplicar primeiro no CMIPtst, depois de 20261008120000_v1_review_fixes.sql.
-- Idempotente: pode ser executada mais de uma vez.

begin;

-- Falha cedo se o contrato esperado não existir.
do $$
begin
  if to_regclass('public.offices') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.display_panels') is null
     or to_regclass('public.display_panel_offices') is null then
    raise exception 'preflight: offices/profiles/display_panels/display_panel_offices ausentes';
  end if;
  if to_regprocedure('private.public_display_event(jsonb)') is null
     or to_regprocedure('public.get_display_state(text)') is null then
    raise exception 'preflight: aplique antes 20261008120000_v1_review_fixes.sql';
  end if;
end
$$;

-- Recepção, Admin e Master (mesmos perfis que acessam a tela de recepção).
create or replace function private.assert_reception_operator()
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.active and not p.must_change_password
      and p.role::text in ('receptionist','admin','master')
  ) then
    raise exception 'Operação permitida somente para a recepção' using errcode='42501';
  end if;
end
$$;

create or replace function private.is_reception_operator()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.active and not p.must_change_password
      and p.role::text in ('receptionist','admin','master')
  )
$$;

create table if not exists public.office_ticket_queue (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id),
  ticket_number integer not null check (ticket_number between 1 and 9999),
  status text not null default 'waiting' check (status in ('waiting','called','finished','cancelled')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  called_at timestamptz,
  closed_at timestamptz
);
create index if not exists office_ticket_queue_active_idx
  on public.office_ticket_queue (office_id, created_at) where status in ('waiting','called');

-- Cada chamada/rechamada vira um evento: é daqui que a TV recupera o anúncio pelo polling.
create table if not exists public.office_ticket_calls (
  id bigint generated always as identity primary key,
  queue_id uuid not null references public.office_ticket_queue(id) on delete cascade,
  office_id uuid not null references public.offices(id),
  ticket_number integer not null,
  is_recall boolean not null default false,
  called_by uuid default auth.uid(),
  called_at timestamptz not null default now()
);
create index if not exists office_ticket_calls_office_idx on public.office_ticket_calls (office_id, called_at desc);

alter table public.office_ticket_queue enable row level security;
alter table public.office_ticket_calls enable row level security;
revoke all on table public.office_ticket_queue from public, anon, authenticated;
revoke all on table public.office_ticket_calls from public, anon, authenticated;
-- Leitura só para o Realtime da recepção; toda escrita passa pelas RPCs abaixo.
grant select on table public.office_ticket_queue to authenticated;
drop policy if exists office_ticket_queue_reception_select on public.office_ticket_queue;
create policy office_ticket_queue_reception_select
  on public.office_ticket_queue for select to authenticated
  using (private.is_reception_operator());

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='office_ticket_queue'
     ) then
    alter publication supabase_realtime add table public.office_ticket_queue;
  end if;
end
$$;

-- "Hoje" no fuso da clínica: senhas de dias anteriores esquecidas na caixa não aparecem nem bloqueiam.
create or replace function private.office_ticket_today_start()
returns timestamptz
language sql
stable
set search_path=''
as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
$$;

create or replace function public.office_ticket_queues()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_reception_operator();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'office_id', o.id,
      'office_name', o.name,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.id,
          'ticket_number', q.ticket_number,
          'display_number', lpad(q.ticket_number::text, 4, '0'),
          'status', q.status,
          'created_at', q.created_at,
          'called_at', q.called_at
        ) order by q.created_at)
        from public.office_ticket_queue q
        where q.office_id=o.id and q.status in ('waiting','called')
          and q.created_at >= private.office_ticket_today_start()
      ), '[]'::jsonb)
    ) order by o.name)
    from public.offices o
    where o.active
  ), '[]'::jsonb);
end
$$;

create or replace function public.office_ticket_enqueue(p_office_id uuid, p_number integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  existing_office text;
  row_id uuid;
begin
  perform private.assert_reception_operator();
  if p_number is null or p_number < 1 or p_number > 9999 then
    raise exception 'Informe uma senha entre 1 e 9999' using errcode='22023';
  end if;
  if not exists (select 1 from public.offices o where o.id=p_office_id and o.active) then
    raise exception 'Consultório não encontrado ou inativo' using errcode='23503';
  end if;

  -- Serializa encaminhamentos da mesma senha: dois cliques não colocam a senha em duas caixas.
  perform pg_advisory_xact_lock(hashtextextended('office_ticket:' || p_number::text, 0));

  select o.name into existing_office
  from public.office_ticket_queue q join public.offices o on o.id=q.office_id
  where q.ticket_number=p_number and q.status in ('waiting','called')
    and q.created_at >= private.office_ticket_today_start()
  limit 1;
  if existing_office is not null then
    raise exception 'Senha % já está em %', lpad(p_number::text, 4, '0'), existing_office using errcode='23505';
  end if;

  insert into public.office_ticket_queue (office_id, ticket_number)
  values (p_office_id, p_number)
  returning id into row_id;

  return jsonb_build_object('id', row_id, 'display_number', lpad(p_number::text, 4, '0'));
end
$$;

-- p_action: 'call' (chama; se já chamada, rechama), 'finish' (atendida) ou 'cancel' (remover da caixa).
-- Em 'call' devolve o evento da TV no mesmo formato de get_public_display_state.
create or replace function public.office_ticket_action(p_queue_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.office_ticket_queue%rowtype;
  office_name text;
  recall boolean;
  call_id bigint;
  call_at timestamptz;
begin
  perform private.assert_reception_operator();

  select * into q from public.office_ticket_queue where id=p_queue_id for update;
  if q.id is null then
    raise exception 'Senha não encontrada na caixa do consultório' using errcode='23503';
  end if;
  if q.status not in ('waiting','called') then
    raise exception 'Esta senha já saiu da caixa do consultório' using errcode='23514';
  end if;

  if p_action in ('finish','cancel') then
    update public.office_ticket_queue
    set status = case when p_action='finish' then 'finished' else 'cancelled' end, closed_at=now()
    where id=q.id;
    return jsonb_build_object('id', q.id);
  end if;

  if p_action <> 'call' then
    raise exception 'Ação inválida' using errcode='22023';
  end if;

  if exists (
    select 1 from public.office_ticket_calls c
    where c.queue_id=q.id and c.called_at >= now() - interval '2 seconds'
  ) then
    raise exception 'Chamada duplicada bloqueada' using errcode='23505';
  end if;

  recall := q.status='called';
  insert into public.office_ticket_calls (queue_id, office_id, ticket_number, is_recall)
  values (q.id, q.office_id, q.ticket_number, recall)
  returning id, called_at into call_id, call_at;

  update public.office_ticket_queue
  set status='called', called_at=coalesce(called_at, call_at)
  where id=q.id;

  select o.name into office_name from public.offices o where o.id=q.office_id;

  return jsonb_build_object(
    'event_key', 'o' || call_id,
    'id', q.id,
    'kind', 'ticket',
    'is_recall', recall,
    'display_number', lpad(q.ticket_number::text, 4, '0'),
    'destination', coalesce(office_name, 'Consultório'),
    'office_id', q.office_id,
    'at', call_at
  );
end
$$;

revoke all on function public.office_ticket_queues() from public, anon, authenticated;
revoke all on function public.office_ticket_enqueue(uuid, integer) from public, anon, authenticated;
revoke all on function public.office_ticket_action(uuid, text) from public, anon, authenticated;
grant execute on function public.office_ticket_queues() to authenticated;
grant execute on function public.office_ticket_enqueue(uuid, integer) to authenticated;
grant execute on function public.office_ticket_action(uuid, text) to authenticated;

-- TV pública: junta as chamadas dos consultórios vinculados ao painel com o estado de get_display_state.
-- Mesmo corpo da versão de 20261008120000_v1_review_fixes.sql, mais a mescla dos eventos de consultório.
create or replace function public.get_public_display_state(p_panel_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  state jsonb;
  base_current jsonb;
  history_events jsonb;
  office_events jsonb;
  merged jsonb;
begin
  state := public.get_display_state(p_panel_slug);
  if state is null then
    return null;
  end if;

  base_current := private.public_display_event(state->'current');

  select coalesce(jsonb_agg(t.ev), '[]'::jsonb)
  into history_events
  from (
    select private.public_display_event(item) as ev
    from jsonb_array_elements(coalesce(state->'history','[]'::jsonb)) item
  ) t
  where t.ev is not null;

  select coalesce(jsonb_agg(ev order by called_at desc), '[]'::jsonb)
  into office_events
  from (
    select c.called_at, jsonb_build_object(
      'event_key', 'o' || c.id,
      'id', c.queue_id,
      'kind', 'ticket',
      'is_recall', c.is_recall,
      'display_number', lpad(c.ticket_number::text, 4, '0'),
      'destination', o.name,
      'at', c.called_at
    ) as ev
    from public.office_ticket_calls c
    join public.offices o on o.id=c.office_id
    join public.display_panel_offices dpo on dpo.office_id=c.office_id
    join public.display_panels dp on dp.id=dpo.display_panel_id
    where dp.code=p_panel_slug and dp.active
      and c.called_at >= now() - interval '12 hours'
    order by c.called_at desc
    limit 10
  ) t;

  if jsonb_array_length(office_events) > 0 then
    -- Ordena tudo pelo horário; o mais recente vira o "current" e o restante segue como histórico.
    select coalesce(jsonb_agg(ev order by ts desc nulls last), '[]'::jsonb)
    into merged
    from (
      select distinct on (ev->>'event_key') ev,
        case when (ev->>'at') ~ '^\d{4}-\d{2}-\d{2}' then (ev->>'at')::timestamptz end as ts
      from jsonb_array_elements(
        case when base_current is null then '[]'::jsonb else jsonb_build_array(base_current) end
        || history_events || office_events
      ) ev
      order by ev->>'event_key'
    ) t;
    base_current := merged->0;
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
    into history_events
    from jsonb_array_elements(merged) with ordinality as x(e, n)
    where n between 2 and 11;
  end if;

  return jsonb_build_object(
    'panel', case when state->'panel' is null or jsonb_typeof(state->'panel') <> 'object' then null
                  else jsonb_build_object('code', state->'panel'->'code', 'name', state->'panel'->'name') end,
    'current', base_current,
    'history', history_events
  );
end
$$;

revoke all on function public.get_public_display_state(text) from public, anon, authenticated;
grant execute on function public.get_public_display_state(text) to anon, authenticated;

commit;

-- ================================================================
-- 20261021120000_office_ticket_doctor_access.sql
-- ================================================================
-- Médico com sessão ativa em um consultório vê e opera as senhas encaminhadas a esse consultório.
-- Complementa 20261020120000_office_ticket_queue.sql (aplicar depois dela). Idempotente.
-- A recepção, o Admin e o Master continuam podendo operar qualquer consultório.

begin;

do $$
begin
  if to_regclass('public.office_ticket_queue') is null or to_regclass('public.doctor_sessions') is null
     or to_regclass('public.doctors') is null then
    raise exception 'preflight: aplique antes 20261020120000_office_ticket_queue.sql';
  end if;
end
$$;

-- Recepção/Admin/Master, ou o médico com sessão ativa no consultório informado.
create or replace function private.can_access_office_tickets(p_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_reception_operator()
    or exists (
      select 1
      from public.doctors d
      join public.profiles p on p.id=d.profile_id
      join public.doctor_sessions s on s.doctor_id=d.id and s.status='active'
      where d.profile_id=auth.uid() and d.active and p.active and not p.must_change_password
        and s.office_id=p_office_id
    )
$$;

-- Realtime do médico (a leitura direta continua bloqueada para anon).
drop policy if exists office_ticket_queue_reception_select on public.office_ticket_queue;
drop policy if exists office_ticket_queue_office_select on public.office_ticket_queue;
create policy office_ticket_queue_office_select
  on public.office_ticket_queue for select to authenticated
  using (private.can_access_office_tickets(office_id));

create or replace function public.office_ticket_office_queue(p_office_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;
  if not private.can_access_office_tickets(p_office_id) then
    raise exception 'Sem acesso às senhas deste consultório' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'ticket_number', q.ticket_number,
      'display_number', lpad(q.ticket_number::text, 4, '0'),
      'status', q.status,
      'created_at', q.created_at,
      'called_at', q.called_at
    ) order by q.created_at)
    from public.office_ticket_queue q
    where q.office_id=p_office_id and q.status in ('waiting','called')
      and q.created_at >= private.office_ticket_today_start()
  ), '[]'::jsonb);
end
$$;

-- Mesma regra de antes, mas liberada ao médico do consultório da senha.
create or replace function public.office_ticket_action(p_queue_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.office_ticket_queue%rowtype;
  office_name text;
  recall boolean;
  call_id bigint;
  call_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;

  select * into q from public.office_ticket_queue where id=p_queue_id for update;
  if q.id is null then
    raise exception 'Senha não encontrada na caixa do consultório' using errcode='23503';
  end if;
  if not private.can_access_office_tickets(q.office_id) then
    raise exception 'Sem acesso às senhas deste consultório' using errcode='42501';
  end if;
  if q.status not in ('waiting','called') then
    raise exception 'Esta senha já saiu da caixa do consultório' using errcode='23514';
  end if;

  if p_action in ('finish','cancel') then
    update public.office_ticket_queue
    set status = case when p_action='finish' then 'finished' else 'cancelled' end, closed_at=now()
    where id=q.id;
    return jsonb_build_object('id', q.id);
  end if;

  if p_action <> 'call' then
    raise exception 'Ação inválida' using errcode='22023';
  end if;

  if exists (
    select 1 from public.office_ticket_calls c
    where c.queue_id=q.id and c.called_at >= now() - interval '2 seconds'
  ) then
    raise exception 'Chamada duplicada bloqueada' using errcode='23505';
  end if;

  recall := q.status='called';
  insert into public.office_ticket_calls (queue_id, office_id, ticket_number, is_recall)
  values (q.id, q.office_id, q.ticket_number, recall)
  returning id, called_at into call_id, call_at;

  update public.office_ticket_queue
  set status='called', called_at=coalesce(called_at, call_at)
  where id=q.id;

  select o.name into office_name from public.offices o where o.id=q.office_id;

  return jsonb_build_object(
    'event_key', 'o' || call_id,
    'id', q.id,
    'kind', 'ticket',
    'is_recall', recall,
    'display_number', lpad(q.ticket_number::text, 4, '0'),
    'destination', coalesce(office_name, 'Consultório'),
    'office_id', q.office_id,
    'at', call_at
  );
end
$$;

revoke all on function public.office_ticket_office_queue(uuid) from public, anon, authenticated;
grant execute on function public.office_ticket_office_queue(uuid) to authenticated;
revoke all on function public.office_ticket_action(uuid, text) from public, anon, authenticated;
grant execute on function public.office_ticket_action(uuid, text) to authenticated;

commit;

-- ================================================================
-- 20261022120000_office_ticket_doctor_only.sql
-- ================================================================
-- Senha encaminhada ao consultório: só o médico do consultório (ou Admin/Master atuando como médico) chama,
-- rechama, confirma (conclui) ou cancela. A recepção só encaminha e pode TROCAR o consultório da senha.
-- Complementa 20261020120000 e 20261021120000 (aplicar depois delas). Idempotente.

begin;

do $$
begin
  if to_regprocedure('private.can_access_office_tickets(uuid)') is null
     or to_regclass('public.office_ticket_queue') is null then
    raise exception 'preflight: aplique antes 20261020120000 e 20261021120000';
  end if;
end
$$;

-- Quem pode OPERAR (chamar/confirmar/cancelar): Admin/Master ou o médico com sessão ativa no consultório.
-- A recepção comum fica de fora.
create or replace function private.can_operate_office_tickets(p_office_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.is_operational_superuser()
    or exists (
      select 1
      from public.doctors d
      join public.profiles p on p.id=d.profile_id
      join public.doctor_sessions s on s.doctor_id=d.id and s.status='active'
      where d.profile_id=auth.uid() and d.active and p.active and not p.must_change_password
        and s.office_id=p_office_id
    )
$$;

create or replace function public.office_ticket_action(p_queue_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.office_ticket_queue%rowtype;
  office_name text;
  recall boolean;
  call_id bigint;
  call_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;

  select * into q from public.office_ticket_queue where id=p_queue_id for update;
  if q.id is null then
    raise exception 'Senha não encontrada na caixa do consultório' using errcode='23503';
  end if;
  if not private.can_operate_office_tickets(q.office_id) then
    raise exception 'Somente o médico do consultório pode chamar, confirmar ou cancelar esta senha'
      using errcode='42501';
  end if;
  if q.status not in ('waiting','called') then
    raise exception 'Esta senha já saiu da caixa do consultório' using errcode='23514';
  end if;

  if p_action in ('finish','cancel') then
    update public.office_ticket_queue
    set status = case when p_action='finish' then 'finished' else 'cancelled' end, closed_at=now()
    where id=q.id;
    return jsonb_build_object('id', q.id);
  end if;

  if p_action <> 'call' then
    raise exception 'Ação inválida' using errcode='22023';
  end if;

  if exists (
    select 1 from public.office_ticket_calls c
    where c.queue_id=q.id and c.called_at >= now() - interval '2 seconds'
  ) then
    raise exception 'Chamada duplicada bloqueada' using errcode='23505';
  end if;

  recall := q.status='called';
  insert into public.office_ticket_calls (queue_id, office_id, ticket_number, is_recall)
  values (q.id, q.office_id, q.ticket_number, recall)
  returning id, called_at into call_id, call_at;

  update public.office_ticket_queue
  set status='called', called_at=coalesce(called_at, call_at)
  where id=q.id;

  select o.name into office_name from public.offices o where o.id=q.office_id;

  return jsonb_build_object(
    'event_key', 'o' || call_id,
    'id', q.id,
    'kind', 'ticket',
    'is_recall', recall,
    'display_number', lpad(q.ticket_number::text, 4, '0'),
    'destination', coalesce(office_name, 'Consultório'),
    'office_id', q.office_id,
    'at', call_at
  );
end
$$;

-- Recepção (e Admin/Master): troca o consultório de uma senha que ainda não saiu da caixa.
-- Uma senha já chamada volta a "aguardando" no novo consultório.
create or replace function public.office_ticket_move(p_queue_id uuid, p_office_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.office_ticket_queue%rowtype;
  new_name text;
begin
  perform private.assert_reception_operator();

  select * into q from public.office_ticket_queue where id=p_queue_id for update;
  if q.id is null then
    raise exception 'Senha não encontrada na caixa do consultório' using errcode='23503';
  end if;
  if q.status not in ('waiting','called') then
    raise exception 'Esta senha já saiu da caixa do consultório' using errcode='23514';
  end if;

  select o.name into new_name from public.offices o where o.id=p_office_id and o.active;
  if new_name is null then
    raise exception 'Consultório não encontrado ou inativo' using errcode='23503';
  end if;
  if q.office_id = p_office_id then
    return jsonb_build_object('id', q.id, 'office_name', new_name);
  end if;

  update public.office_ticket_queue
  set office_id=p_office_id, status='waiting', called_at=null
  where id=q.id;

  return jsonb_build_object('id', q.id, 'office_name', new_name);
end
$$;

revoke all on function public.office_ticket_action(uuid, text) from public, anon, authenticated;
revoke all on function public.office_ticket_move(uuid, uuid) from public, anon, authenticated;
grant execute on function public.office_ticket_action(uuid, text) to authenticated;
grant execute on function public.office_ticket_move(uuid, uuid) to authenticated;

commit;

-- ================================================================
-- 20261023120000_global_ticket_sequence.sql
-- ================================================================
-- Sequência de senhas ÚNICA para a clínica (antes cada guichê tinha seu próprio contador).
-- O guichê passa a ser só o destino ("Senha 45 — Guichê 2"); qualquer recepcionista chama sempre o próximo
-- número da fila geral.
--
-- Como o código das RPCs antigas não está versionado, esta migration NÃO as reescreve: "chamar próxima"
-- reserva o número no contador global (com trava) e delega a chamada à public.call_specific_ticket já
-- existente, que continua gravando ticket_calls, atualizando a TV etc.
-- Depois de aplicar, o frontend usa call_next_global_ticket / get_global_ticket_counter_state /
-- set_next_global_ticket; sem a migration, o frontend continua no modo antigo (por guichê).
--
-- Não aplicada. Aplicar primeiro no CMIPtst, depois de 20261020120000 (usa private.assert_reception_operator).
-- Idempotente: pode ser executada mais de uma vez.

begin;

do $$
begin
  if to_regclass('public.service_points') is null then
    raise exception 'preflight: public.service_points ausente';
  end if;
  if to_regprocedure('private.assert_reception_operator()') is null then
    raise exception 'preflight: aplique antes 20261020120000_office_ticket_queue.sql';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='call_specific_ticket' and p.pronargs=2
  ) then
    raise exception 'preflight: public.call_specific_ticket(guichê, número) não existe';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_ticket_counter_state' and p.pronargs=1
  ) then
    raise exception 'preflight: public.get_ticket_counter_state(guichê) não existe';
  end if;
end
$$;

-- Uma única linha (id = true): o último número chamado pela clínica.
create table if not exists public.global_ticket_counter (
  id boolean primary key default true check (id),
  current_number integer not null default 0 check (current_number between 0 and 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.global_ticket_counter enable row level security;
revoke all on table public.global_ticket_counter from public, anon, authenticated;

-- Primeira aplicação: tenta começar do maior número atual entre os guichês, para não repetir senhas já
-- chamadas. Se a função antiga exigir usuário logado (no SQL Editor não há), começa do zero: depois de aplicar,
-- use "Definir Senha Inicial" na recepção.
do $$
declare
  start_number integer := 0;
begin
  if not exists (select 1 from public.global_ticket_counter) then
    begin
      select coalesce(max(nullif(to_jsonb(s)->>'current_number', '')::integer), 0)
      into start_number
      from public.service_points sp
      cross join lateral public.get_ticket_counter_state(sp.id) s
      where sp.active;
    exception when others then
      raise notice 'Contador global começa em 0 (não foi possível ler os guichês: %). Defina a senha inicial.', sqlerrm;
      start_number := 0;
    end;
    insert into public.global_ticket_counter (id, current_number)
    values (true, least(greatest(coalesce(start_number, 0), 0), 1000));
  end if;
end
$$;

-- Reserva o próximo número (1..1000, volta para 1 depois de 1000). A trava de linha faz dois computadores
-- clicando juntos receberem números diferentes; se a chamada falhar, a transação desfaz a reserva.
create or replace function private.take_next_global_ticket()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  n integer;
begin
  select current_number into n from public.global_ticket_counter where id for update;
  if n is null then
    insert into public.global_ticket_counter (id, current_number) values (true, 0) on conflict (id) do nothing;
    select current_number into n from public.global_ticket_counter where id for update;
  end if;
  n := case when n >= 1000 then 1 else n + 1 end;
  update public.global_ticket_counter set current_number=n, updated_at=now(), updated_by=auth.uid() where id;
  return n;
end
$$;

-- Mesmo tipo de retorno de call_specific_ticket (o frontend lê a resposta igual). Criada dinamicamente porque
-- esse tipo não está versionado no repositório.
do $$
declare
  result_type text;
  returns_set boolean;
  delegate text;
begin
  select pg_get_function_result(p.oid), p.proretset
  into result_type, returns_set
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='call_specific_ticket' and p.pronargs=2
  limit 1;

  delegate := case when returns_set
    then 'return query select * from public.call_specific_ticket(p_service_point_id, ticket_n);'
    else 'return public.call_specific_ticket(p_service_point_id, ticket_n);' end;

  execute 'drop function if exists public.call_next_global_ticket(uuid)';
  execute format($f$
    create function public.call_next_global_ticket(p_service_point_id uuid)
    returns %s
    language plpgsql
    security definer
    set search_path=''
    as $body$
    declare
      ticket_n integer;
    begin
      perform private.assert_reception_operator();
      if not exists (select 1 from public.service_points sp where sp.id=p_service_point_id and sp.active) then
        raise exception 'Guichê não encontrado ou inativo' using errcode='23503';
      end if;
      ticket_n := private.take_next_global_ticket();
      %s
    end
    $body$
  $f$, result_type, delegate);
end
$$;

create or replace function public.get_global_ticket_counter_state()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  n integer;
begin
  perform private.assert_reception_operator();
  select current_number into n from public.global_ticket_counter where id;
  n := coalesce(n, 0);
  return jsonb_build_object(
    'current_number', n,
    'next_number', case when n >= 1000 then 1 else n + 1 end,
    'display_next', lpad((case when n >= 1000 then 1 else n + 1 end)::text, 4, '0')
  );
end
$$;

-- "Definir senha inicial": a próxima chamada da clínica (em qualquer guichê) será p_number.
create or replace function public.set_next_global_ticket(p_number integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.assert_reception_operator();
  if p_number is null or p_number < 1 or p_number > 1000 then
    raise exception 'Informe uma senha entre 1 e 1000' using errcode='22023';
  end if;
  insert into public.global_ticket_counter (id, current_number, updated_at, updated_by)
  values (true, p_number - 1, now(), auth.uid())
  on conflict (id) do update
    set current_number=excluded.current_number, updated_at=excluded.updated_at, updated_by=excluded.updated_by;
  return public.get_global_ticket_counter_state();
end
$$;

revoke all on function private.take_next_global_ticket() from public, anon, authenticated;
revoke all on function public.call_next_global_ticket(uuid) from public, anon, authenticated;
revoke all on function public.get_global_ticket_counter_state() from public, anon, authenticated;
revoke all on function public.set_next_global_ticket(integer) from public, anon, authenticated;
grant execute on function public.call_next_global_ticket(uuid) to authenticated;
grant execute on function public.get_global_ticket_counter_state() to authenticated;
grant execute on function public.set_next_global_ticket(integer) to authenticated;

commit;

-- ================================================================
-- 20261024120000_office_ticket_patient_name.sql
-- ================================================================
-- Nome do paciente junto da senha encaminhada ao consultório.
-- A recepção digita senha + nome; o nome fica gravado em office_ticket_queue e aparece para o médico.
-- O nome NÃO entra em get_public_display_state nem em office_ticket_calls: a TV pública continua só com a senha.
-- Aplicar depois de 20261021120000 e 20261022120000. Idempotente.

begin;

do $$
begin
  if to_regclass('public.office_ticket_queue') is null
     or to_regprocedure('private.assert_reception_operator()') is null
     or to_regprocedure('private.can_access_office_tickets(uuid)') is null then
    raise exception 'preflight: aplique antes 20261020120000 e 20261021120000';
  end if;
end
$$;

alter table public.office_ticket_queue add column if not exists patient_name text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'office_ticket_queue_patient_name_len'
  ) then
    alter table public.office_ticket_queue
      add constraint office_ticket_queue_patient_name_len
      check (patient_name is null or char_length(patient_name) between 2 and 120);
  end if;
end
$$;

-- Troca a assinatura (uuid, integer) por (uuid, integer, text default null): chamadas antigas continuam valendo.
drop function if exists public.office_ticket_enqueue(uuid, integer);
-- Reaplicação depois de 20261024140000 (que pôs default em p_number): o Postgres não deixa tirar o default
-- com CREATE OR REPLACE, então a versão de 3 parâmetros também é recriada do zero.
drop function if exists public.office_ticket_enqueue(uuid, integer, text);
create or replace function public.office_ticket_enqueue(p_office_id uuid, p_number integer, p_patient_name text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  existing_office text;
  row_id uuid;
  clean_name text := nullif(btrim(regexp_replace(coalesce(p_patient_name, ''), '\s+', ' ', 'g')), '');
begin
  perform private.assert_reception_operator();
  if p_number is null or p_number < 1 or p_number > 9999 then
    raise exception 'Informe uma senha entre 1 e 9999' using errcode='22023';
  end if;
  if clean_name is not null and char_length(clean_name) not between 2 and 120 then
    raise exception 'Nome do paciente deve ter de 2 a 120 caracteres' using errcode='22023';
  end if;
  if not exists (select 1 from public.offices o where o.id=p_office_id and o.active) then
    raise exception 'Consultório não encontrado ou inativo' using errcode='23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('office_ticket:' || p_number::text, 0));

  select o.name into existing_office
  from public.office_ticket_queue q join public.offices o on o.id=q.office_id
  where q.ticket_number=p_number and q.status in ('waiting','called')
    and q.created_at >= private.office_ticket_today_start()
  limit 1;
  if existing_office is not null then
    raise exception 'Senha % já está em %', lpad(p_number::text, 4, '0'), existing_office using errcode='23505';
  end if;

  insert into public.office_ticket_queue (office_id, ticket_number, patient_name)
  values (p_office_id, p_number, clean_name)
  returning id into row_id;

  return jsonb_build_object('id', row_id, 'display_number', lpad(p_number::text, 4, '0'), 'patient_name', clean_name);
end
$$;

-- Caixas da recepção, agora com o nome.
create or replace function public.office_ticket_queues()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  perform private.assert_reception_operator();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'office_id', o.id,
      'office_name', o.name,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.id,
          'ticket_number', q.ticket_number,
          'display_number', lpad(q.ticket_number::text, 4, '0'),
          'patient_name', q.patient_name,
          'status', q.status,
          'created_at', q.created_at,
          'called_at', q.called_at
        ) order by q.created_at)
        from public.office_ticket_queue q
        where q.office_id=o.id and q.status in ('waiting','called')
          and q.created_at >= private.office_ticket_today_start()
      ), '[]'::jsonb)
    ) order by o.name)
    from public.offices o
    where o.active
  ), '[]'::jsonb);
end
$$;

-- Fila do consultório para o médico, agora com o nome.
create or replace function public.office_ticket_office_queue(p_office_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;
  if not private.can_access_office_tickets(p_office_id) then
    raise exception 'Sem acesso às senhas deste consultório' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'ticket_number', q.ticket_number,
      'display_number', lpad(q.ticket_number::text, 4, '0'),
      'patient_name', q.patient_name,
      'status', q.status,
      'created_at', q.created_at,
      'called_at', q.called_at
    ) order by q.created_at)
    from public.office_ticket_queue q
    where q.office_id=p_office_id and q.status in ('waiting','called')
      and q.created_at >= private.office_ticket_today_start()
  ), '[]'::jsonb);
end
$$;

revoke all on function public.office_ticket_enqueue(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.office_ticket_queues() from public, anon, authenticated;
revoke all on function public.office_ticket_office_queue(uuid) from public, anon, authenticated;
grant execute on function public.office_ticket_enqueue(uuid, integer, text) to authenticated;
grant execute on function public.office_ticket_queues() to authenticated;
grant execute on function public.office_ticket_office_queue(uuid) to authenticated;

commit;

-- ================================================================
-- 20261024130000_office_ticket_tv_patient_name.sql
-- ================================================================
-- A TV chama a senha encaminhada ao consultório pelo NOME do paciente (quando a recepção informou um).
-- Decisão do CMIP: a TV pública recebe o nome COMPLETO informado pela recepção. Atenção: get_public_display_state
-- é executável por anon, então o nome completo fica legível por qualquer cliente que conheça o código do painel
-- (apenas das chamadas das últimas 12 horas). Sem nome, o comportamento é o de sempre (só a senha).
-- Aplicar depois de 20261024120000_office_ticket_patient_name.sql e 20261022120000. Idempotente.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='office_ticket_queue' and column_name='patient_name'
  ) then
    raise exception 'preflight: aplique antes 20261024120000_office_ticket_patient_name.sql';
  end if;
  if to_regprocedure('private.can_operate_office_tickets(uuid)') is null
     or to_regprocedure('private.public_display_event(jsonb)') is null then
    raise exception 'preflight: aplique antes 20261022120000 e 20261008120000';
  end if;
end
$$;

-- Chamada/rechamada do médico: o evento devolvido já leva o nome mascarado para o broadcast da TV.
create or replace function public.office_ticket_action(p_queue_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.office_ticket_queue%rowtype;
  office_name text;
  recall boolean;
  call_id bigint;
  call_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode='42501';
  end if;

  select * into q from public.office_ticket_queue where id=p_queue_id for update;
  if q.id is null then
    raise exception 'Senha não encontrada na caixa do consultório' using errcode='23503';
  end if;
  if not private.can_operate_office_tickets(q.office_id) then
    raise exception 'Somente o médico do consultório pode chamar, confirmar ou cancelar esta senha'
      using errcode='42501';
  end if;
  if q.status not in ('waiting','called') then
    raise exception 'Esta senha já saiu da caixa do consultório' using errcode='23514';
  end if;

  if p_action in ('finish','cancel') then
    update public.office_ticket_queue
    set status = case when p_action='finish' then 'finished' else 'cancelled' end, closed_at=now()
    where id=q.id;
    return jsonb_build_object('id', q.id);
  end if;

  if p_action <> 'call' then
    raise exception 'Ação inválida' using errcode='22023';
  end if;

  if exists (
    select 1 from public.office_ticket_calls c
    where c.queue_id=q.id and c.called_at >= now() - interval '2 seconds'
  ) then
    raise exception 'Chamada duplicada bloqueada' using errcode='23505';
  end if;

  recall := q.status='called';
  insert into public.office_ticket_calls (queue_id, office_id, ticket_number, is_recall)
  values (q.id, q.office_id, q.ticket_number, recall)
  returning id, called_at into call_id, call_at;

  update public.office_ticket_queue
  set status='called', called_at=coalesce(called_at, call_at)
  where id=q.id;

  select o.name into office_name from public.offices o where o.id=q.office_id;

  return jsonb_build_object(
    'event_key', 'o' || call_id,
    'id', q.id,
    'kind', 'ticket',
    'is_recall', recall,
    'display_number', lpad(q.ticket_number::text, 4, '0'),
    'patient_name', q.patient_name,
    'destination', coalesce(office_name, 'Consultório'),
    'office_id', q.office_id,
    'at', call_at
  );
end
$$;

-- Estado público da TV: mesmos eventos de antes, agora com o nome mascarado nas chamadas de consultório.
create or replace function public.get_public_display_state(p_panel_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  state jsonb;
  base_current jsonb;
  history_events jsonb;
  office_events jsonb;
  merged jsonb;
begin
  state := public.get_display_state(p_panel_slug);
  if state is null then
    return null;
  end if;

  base_current := private.public_display_event(state->'current');

  select coalesce(jsonb_agg(t.ev), '[]'::jsonb)
  into history_events
  from (
    select private.public_display_event(item) as ev
    from jsonb_array_elements(coalesce(state->'history','[]'::jsonb)) item
  ) t
  where t.ev is not null;

  select coalesce(jsonb_agg(ev order by called_at desc), '[]'::jsonb)
  into office_events
  from (
    select c.called_at, jsonb_build_object(
      'event_key', 'o' || c.id,
      'id', c.queue_id,
      'kind', 'ticket',
      'is_recall', c.is_recall,
      'display_number', lpad(c.ticket_number::text, 4, '0'),
      'patient_name', qq.patient_name,
      'destination', o.name,
      'at', c.called_at
    ) as ev
    from public.office_ticket_calls c
    join public.office_ticket_queue qq on qq.id=c.queue_id
    join public.offices o on o.id=c.office_id
    join public.display_panel_offices dpo on dpo.office_id=c.office_id
    join public.display_panels dp on dp.id=dpo.display_panel_id
    where dp.code=p_panel_slug and dp.active
      and c.called_at >= now() - interval '12 hours'
    order by c.called_at desc
    limit 10
  ) t;

  if jsonb_array_length(office_events) > 0 then
    select coalesce(jsonb_agg(ev order by ts desc nulls last), '[]'::jsonb)
    into merged
    from (
      select distinct on (ev->>'event_key') ev,
        case when (ev->>'at') ~ '^\d{4}-\d{2}-\d{2}' then (ev->>'at')::timestamptz end as ts
      from jsonb_array_elements(
        case when base_current is null then '[]'::jsonb else jsonb_build_array(base_current) end
        || history_events || office_events
      ) ev
      order by ev->>'event_key'
    ) t;
    base_current := merged->0;
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
    into history_events
    from jsonb_array_elements(merged) with ordinality as x(e, n)
    where n between 2 and 11;
  end if;

  return jsonb_build_object(
    'panel', case when state->'panel' is null or jsonb_typeof(state->'panel') <> 'object' then null
                  else jsonb_build_object('code', state->'panel'->'code', 'name', state->'panel'->'name') end,
    'current', base_current,
    'history', history_events
  );
end
$$;

revoke all on function public.office_ticket_action(uuid, text) from public, anon, authenticated;
grant execute on function public.office_ticket_action(uuid, text) to authenticated;
revoke all on function public.get_public_display_state(text) from public, anon, authenticated;
grant execute on function public.get_public_display_state(text) to anon, authenticated;

commit;

-- ================================================================
-- 20261024140000_office_ticket_name_or_number.sql
-- ================================================================
-- Encaminhar ao consultório informando só o NOME, só a SENHA, ou os dois (pelo menos um).
-- Sem número, display_number fica nulo e a TV chama pelo nome.
-- Aplicar depois de 20261024120000 e 20261024130000. Idempotente.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='office_ticket_queue' and column_name='patient_name'
  ) then
    raise exception 'preflight: aplique antes 20261024120000_office_ticket_patient_name.sql';
  end if;
end
$$;

-- O número deixa de ser obrigatório (mantém a faixa 1..9999 quando existe).
alter table public.office_ticket_queue alter column ticket_number drop not null;
alter table public.office_ticket_calls alter column ticket_number drop not null;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.office_ticket_queue'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%ticket_number%between%'
  loop
    execute format('alter table public.office_ticket_queue drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'office_ticket_queue_number_range') then
    alter table public.office_ticket_queue
      add constraint office_ticket_queue_number_range
      check (ticket_number is null or ticket_number between 1 and 9999);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'office_ticket_queue_number_or_name') then
    alter table public.office_ticket_queue
      add constraint office_ticket_queue_number_or_name
      check (ticket_number is not null or patient_name is not null);
  end if;
end
$$;

create or replace function public.office_ticket_enqueue(p_office_id uuid, p_number integer default null, p_patient_name text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  existing_office text;
  row_id uuid;
  clean_name text := nullif(btrim(regexp_replace(coalesce(p_patient_name, ''), '\s+', ' ', 'g')), '');
begin
  perform private.assert_reception_operator();
  if p_number is null and clean_name is null then
    raise exception 'Informe a senha ou o nome do paciente' using errcode='22023';
  end if;
  if p_number is not null and (p_number < 1 or p_number > 9999) then
    raise exception 'Informe uma senha entre 1 e 9999' using errcode='22023';
  end if;
  if clean_name is not null and char_length(clean_name) not between 2 and 120 then
    raise exception 'Nome do paciente deve ter de 2 a 120 caracteres' using errcode='22023';
  end if;
  if not exists (select 1 from public.offices o where o.id=p_office_id and o.active) then
    raise exception 'Consultório não encontrado ou inativo' using errcode='23503';
  end if;

  if p_number is not null then
    perform pg_advisory_xact_lock(hashtextextended('office_ticket:' || p_number::text, 0));

    select o.name into existing_office
    from public.office_ticket_queue q join public.offices o on o.id=q.office_id
    where q.ticket_number=p_number and q.status in ('waiting','called')
      and q.created_at >= private.office_ticket_today_start()
    limit 1;
    if existing_office is not null then
      raise exception 'Senha % já está em %', lpad(p_number::text, 4, '0'), existing_office using errcode='23505';
    end if;
  end if;

  insert into public.office_ticket_queue (office_id, ticket_number, patient_name)
  values (p_office_id, p_number, clean_name)
  returning id into row_id;

  return jsonb_build_object(
    'id', row_id,
    'display_number', case when p_number is null then null else lpad(p_number::text, 4, '0') end,
    'patient_name', clean_name
  );
end
$$;

revoke all on function public.office_ticket_enqueue(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.office_ticket_enqueue(uuid, integer, text) to authenticated;

commit;

-- ================================================================
-- 20261024150000_office_ticket_tv_moved_calls.sql
-- ================================================================
-- Senha trocada de consultório deixa de aparecer na TV do consultório antigo.
-- get_public_display_state passa a ignorar chamadas cuja senha não está mais no consultório da chamada
-- (office_ticket_move muda office_ticket_queue.office_id). Chamadas concluídas/canceladas no mesmo consultório
-- continuam no histórico. Mesmo corpo de 20261024130000, só com a condição qq.office_id = c.office_id.
-- Aplicar depois de 20261024130000. Idempotente.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='office_ticket_queue' and column_name='patient_name'
  ) then
    raise exception 'preflight: aplique antes 20261024120000 e 20261024130000';
  end if;
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
  base_current jsonb;
  history_events jsonb;
  office_events jsonb;
  merged jsonb;
begin
  state := public.get_display_state(p_panel_slug);
  if state is null then
    return null;
  end if;

  base_current := private.public_display_event(state->'current');

  select coalesce(jsonb_agg(t.ev), '[]'::jsonb)
  into history_events
  from (
    select private.public_display_event(item) as ev
    from jsonb_array_elements(coalesce(state->'history','[]'::jsonb)) item
  ) t
  where t.ev is not null;

  select coalesce(jsonb_agg(ev order by called_at desc), '[]'::jsonb)
  into office_events
  from (
    select c.called_at, jsonb_build_object(
      'event_key', 'o' || c.id,
      'id', c.queue_id,
      'kind', 'ticket',
      'is_recall', c.is_recall,
      'display_number', case when c.ticket_number is null then null else lpad(c.ticket_number::text, 4, '0') end,
      'patient_name', qq.patient_name,
      'destination', o.name,
      'at', c.called_at
    ) as ev
    from public.office_ticket_calls c
    join public.office_ticket_queue qq on qq.id=c.queue_id and qq.office_id=c.office_id
    join public.offices o on o.id=c.office_id
    join public.display_panel_offices dpo on dpo.office_id=c.office_id
    join public.display_panels dp on dp.id=dpo.display_panel_id
    where dp.code=p_panel_slug and dp.active
      and c.called_at >= now() - interval '12 hours'
    order by c.called_at desc
    limit 10
  ) t;

  if jsonb_array_length(office_events) > 0 then
    select coalesce(jsonb_agg(ev order by ts desc nulls last), '[]'::jsonb)
    into merged
    from (
      select distinct on (ev->>'event_key') ev,
        case when (ev->>'at') ~ '^\d{4}-\d{2}-\d{2}' then (ev->>'at')::timestamptz end as ts
      from jsonb_array_elements(
        case when base_current is null then '[]'::jsonb else jsonb_build_array(base_current) end
        || history_events || office_events
      ) ev
      order by ev->>'event_key'
    ) t;
    base_current := merged->0;
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb)
    into history_events
    from jsonb_array_elements(merged) with ordinality as x(e, n)
    where n between 2 and 11;
  end if;

  return jsonb_build_object(
    'panel', case when state->'panel' is null or jsonb_typeof(state->'panel') <> 'object' then null
                  else jsonb_build_object('code', state->'panel'->'code', 'name', state->'panel'->'name') end,
    'current', base_current,
    'history', history_events
  );
end
$$;

revoke all on function public.get_public_display_state(text) from public, anon, authenticated;
grant execute on function public.get_public_display_state(text) to anon, authenticated;

commit;

-- ================================================================
-- Permissão usada pela regra de display_panel_offices (TV vinculada ao consultório)
-- ================================================================
grant execute on function public.is_active_user() to authenticated;
