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
