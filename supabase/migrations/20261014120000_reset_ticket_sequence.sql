-- Redefinir a senha inicial de um guichê APAGANDO o histórico de chamadas desse guichê.
-- IRREVERSÍVEL: apaga linhas de public.ticket_calls. Aplicar primeiro no CMIPtst.
-- Somente Admin/Master. A fila médica (medical_queue, patient_calls) não é tocada.

begin;

-- Falha cedo, sem alterar nada, se o schema real não for o esperado.
do $$
begin
  if to_regclass('public.ticket_calls') is null or to_regclass('public.service_points') is null then
    raise exception 'reset_ticket_sequence preflight: ticket_calls/service_points ausentes';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ticket_calls'
      and column_name='service_point_id' and data_type='uuid'
  ) then
    raise exception 'reset_ticket_sequence preflight: ticket_calls.service_point_id (uuid) não existe';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='set_next_ticket' and p.pronargs=2
  ) then
    raise exception 'reset_ticket_sequence preflight: public.set_next_ticket(uuid, numero) não existe';
  end if;
end
$$;

create or replace function public.reset_ticket_sequence(p_service_point_id uuid, p_number integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  deleted_calls integer;
begin
  perform private.assert_operational_superuser();

  if p_number is null or p_number < 1 then
    raise exception 'Número de senha inválido' using errcode='22023';
  end if;
  if not exists (select 1 from public.service_points sp where sp.id = p_service_point_id) then
    raise exception 'Guichê não encontrado' using errcode='23503';
  end if;

  -- Apaga antes de definir o contador: se set_next_ticket depender das chamadas existentes, enxerga o estado limpo.
  delete from public.ticket_calls where service_point_id = p_service_point_id;
  get diagnostics deleted_calls = row_count;

  perform public.set_next_ticket(p_service_point_id, p_number);

  return jsonb_build_object('deleted_calls', deleted_calls, 'next_number', p_number);
end
$$;

revoke all on function public.reset_ticket_sequence(uuid, integer) from public, anon, authenticated;
grant execute on function public.reset_ticket_sequence(uuid, integer) to authenticated;

commit;
