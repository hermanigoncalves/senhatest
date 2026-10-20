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
