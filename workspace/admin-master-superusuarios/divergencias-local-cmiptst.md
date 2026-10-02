# Divergencias conhecidas: repositorio local x CMIPtst

Data da analise local: 2026-09-30.

## Limite da auditoria

O estado remoto do CMIPtst nao foi consultado por determinacao de escopo. Portanto, este documento nao afirma que o repositorio reproduz integralmente o banco remoto. As divergencias abaixo sao as que podem ser comprovadas exclusivamente pelos arquivos locais.

## Achados locais

- O frontend ativo parte de `src/main.jsx` e carrega `src/V1App.jsx`.
- Os perfis usados pelo frontend sao `admin`, `master`, `receptionist` e `doctor`.
- Antes desta mudanca, somente `20260920_v1_doctor_presence_heartbeat.sql` materializava parte do contrato UUID atual. O proprio arquivo registra que `start_doctor_session`, `get_my_doctor_session` e `end_doctor_session` tambem foram ajustados no CMIPtst sem que suas definicoes completas estejam na migration local.
- O frontend referencia RPCs e views cuja definicao atual nao esta materializada integralmente nas migrations locais, entre elas as operacoes de senha, pacientes, filas, administracao, `doctor_queue_view` e `reception_queue_view`.
- O SQL legado baseado em `bigint` foi removido desta copia para evitar uso acidental como baseline do CMIPtst. O contrato local ativo permanece UUID.
- A migration nova usa o contrato UUID indicado pelos arquivos atuais e contem um preflight transacional. Se tabelas, tipos, colunas, RLS ou o helper `private.current_doctor_id()` divergirem, ela aborta antes de criar a superficie delegada.

## Estado remoto ainda nao comprovado

Devem ser verificados manualmente no CMIPtst antes da aplicacao:

- assinaturas e overloads existentes das RPCs operacionais;
- definicoes efetivas de `private.current_role()`, `private.current_doctor_id()` e `private.assert_roles(...)`;
- policies atuais, grants de `EXECUTE` e propriedades `SECURITY DEFINER`/`search_path`;
- estrutura efetiva das views `doctor_queue_view` e `reception_queue_view`;
- nomes das colunas de vinculo de paineis (`display_panel_id` ou `panel_id`);
- autorizacao ja existente de `master`, `admin` e `receptionist` nas RPCs de Recepcao.

As RPCs normais do medico e as views atuais nao sao substituidas pela migration nova. A superficie delegada e adicional e isolada.

