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
