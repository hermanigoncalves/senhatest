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
