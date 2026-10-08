# CMIPtst — V1 ativa

O código executável está em `src/main.jsx → src/V1App.jsx`. Veja o `README.md` da raiz para comandos e estrutura.

## Variáveis do frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Obrigatórias em qualquer ambiente: o build falha sem elas e não há fallback para o projeto de teste.

## Migrations (ordem)

1. `20260920_v1_doctor_presence_heartbeat.sql`
2. `20260929_admin_master_operational_superusers.sql`
3. `20260930_v1_runtime_hardening.sql`
4. `20261002_restore_public_tv_state.sql` (reaplica o estado público da TV; idempotente)
5. `20261003120000_*` e `20261003120100_*` — apenas marcadores (já aplicados no CMIPtst; sem SQL)
6. `20261008120000_v1_review_fixes.sql` — **ainda não aplicada**: auditoria de usuários, trava contra chamada
   duplicada concorrente, fila delegada sem duplicação e estado público da TV com lista de permissão de campos.

Aplicar sempre primeiro no CMIPtst e validar. Teste local descartável: `supabase/tests/run_local.sh`.

## Edge Functions

- `master-user-admin` (neste repositório): criar usuário e redefinir senha. Variável opcional `ALLOWED_ORIGINS`
  (lista separada por vírgula) restringe o CORS.
- `username-login`: **não está neste repositório** (existe só no projeto remoto). Exporte-a com
  `supabase functions download username-login`.

## Banco não reproduzível a partir do repositório

Faltam aqui o schema base e várias RPCs (`call_next_ticket`, `recall_ticket`, `get_display_state`,
`doctor_queue_action`, `master_*`, `admin_list_users`…). Para versioná-las, com acesso ao projeto:

```bash
supabase link --project-ref <ref do CMIPtst>
supabase db dump --schema public,private -f supabase/baseline.sql
```

Nunca coloque `service_role`, secret key, senha de banco ou credenciais reais de usuário no frontend ou nos testes.
