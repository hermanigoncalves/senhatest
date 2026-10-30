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
