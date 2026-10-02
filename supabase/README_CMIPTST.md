# CMIPtst — V1 ativa

O código executável deste pacote foi consolidado na arquitetura V1 (`src/main.jsx` → `src/V1App.jsx`). A geração antiga baseada em Express/Socket.IO, APIs médicas próprias e IDs `bigint` foi removida do repositório corrigido.

## Variáveis do frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Em produção o frontend falha fechado se essas variáveis estiverem ausentes. O fallback para o projeto CMIPtst existe apenas em modo de desenvolvimento.

## Migrations relevantes

1. `20260920_v1_doctor_presence_heartbeat.sql`
2. `20260929_admin_master_operational_superusers.sql`
3. `20260930_v1_runtime_hardening.sql`

A migration de 30/09 endurece transições da fila, bloqueia chamadas duplicadas, cria o identificador canônico de chamada médica e separa o estado público sanitizado da TV.

Nunca coloque `service_role`, secret key, senha de banco ou credenciais reais de usuário no frontend ou nos testes versionados.
