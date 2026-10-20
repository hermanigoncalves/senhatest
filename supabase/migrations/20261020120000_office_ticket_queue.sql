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
