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
