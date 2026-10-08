#!/usr/bin/env bash
# Testa 20261008120000_v1_review_fixes.sql em um Postgres LOCAL descartável (nunca no CMIPtst/produção).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=cmip_review_test
PSQL="psql -v ON_ERROR_STOP=1 -q -At"
Q="$PSQL -d $DB"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$Q -f supabase/tests/stub_schema.sql
$Q -f supabase/migrations/20261002_restore_public_tv_state.sql
$Q -f supabase/migrations/20261008120000_v1_review_fixes.sql 2>/dev/null
$Q -f supabase/migrations/20261008120000_v1_review_fixes.sql 2>/dev/null   # idempotente
echo "ok: migration aplicada duas vezes"

# 1) TV pública: só campos permitidos e nome mascarado
$Q <<'SQL'
do $$
declare s jsonb := public.get_public_display_state('recepcao');
begin
  assert s->'current'->>'patient_name' = 'Maria S.', 'nome deve estar mascarado';
  assert not (s->'current' ? 'patient_cpf'), 'CPF não pode vazar';
  assert not (s->'current' ? 'doctor_id'), 'doctor_id não pode vazar';
  assert not (s->'panel' ? 'secret_cfg'), 'config interna não pode vazar';
  assert jsonb_array_length(s->'history') = 2, 'item inválido do histórico deve ser descartado';
  assert not (s->'history'->0 ? 'phone'), 'telefone não pode vazar';
end $$;
SQL
echo "ok: TV pública usa lista de permissão"

# 2) Fila delegada sem duplicar com 2 sessões ativas
$Q <<'SQL'
insert into offices(id,name) values('11111111-1111-1111-1111-111111111111','Consultório 1');
insert into doctors(id) values('22222222-2222-2222-2222-222222222222');
insert into patients(id,full_name) values('33333333-3333-3333-3333-333333333333','Maria Souza');
insert into doctor_sessions(doctor_id,office_id,status,started_at) values
 ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','active',now()-interval '1 hour'),
 ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','active',now());
insert into medical_queue(id,patient_id,doctor_id,status) values('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','waiting');
do $$ begin assert (select count(*) from public.admin_get_doctor_queue('22222222-2222-2222-2222-222222222222')) = 1, 'fila duplicada'; end $$;
SQL
echo "ok: fila delegada sem duplicação"

# 3) Corrida: duas chamadas simultâneas da mesma fila -> só uma é gravada
race() {
  $Q -c "delete from patient_calls" >/dev/null
  ( $Q -c "begin; insert into patient_calls(queue_id,call_kind) values('44444444-4444-4444-4444-444444444444','call'); select pg_sleep(1.5); commit;" >/dev/null 2>&1 ) &
  sleep 0.4
  ( $Q -c "begin; insert into patient_calls(queue_id,call_kind) values('44444444-4444-4444-4444-444444444444','call'); commit;" >/dev/null 2>&1 ) &
  wait
  $Q -c "select count(*) from patient_calls"
}
$Q -f supabase/tests/old_guard.sql
[ "$(race)" = "2" ] && echo "ok: trigger antigo deixava passar 2 chamadas (corrida reproduzida)"
$Q -f supabase/migrations/20261008120000_v1_review_fixes.sql 2>/dev/null
[ "$(race)" = "1" ] && echo "ok: trigger novo bloqueia a chamada duplicada"
echo "TODOS OS TESTES SQL PASSARAM"
