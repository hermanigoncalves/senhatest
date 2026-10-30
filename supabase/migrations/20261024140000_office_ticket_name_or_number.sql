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
