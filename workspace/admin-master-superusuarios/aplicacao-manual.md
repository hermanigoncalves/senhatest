# Aplicacao manual no CMIPtst

## Artefatos

1. Migration: `supabase/migrations/20260929_admin_master_operational_superusers.sql`
2. Validacao somente leitura: `supabase/manual/20260929_admin_master_operational_validation.sql`

Nenhum desses arquivos foi executado remotamente por esta implementacao.

## Problema e solucao

Admin e Master nao tinham navegacao operacional e o fluxo medico normal deriva o medico de `auth.uid()`. A migration cria RPCs separadas para atuacao delegada, recebendo `p_doctor_id`, mas autorizando o executor exclusivamente pelo profile associado a `auth.uid()`. As RPCs medicas normais permanecem inalteradas.

A migration tambem cria auditoria especifica e policies de leitura adicionais e restritas a Admin/Master. Ela nao desativa RLS, nao adiciona `USING (true)` e nao concede escrita direta nas tabelas operacionais.

## Ordem correta

1. Confirmar visualmente que o projeto selecionado e **CMIPtst**, ref `echypqclxnztvjicnkbf`. Nao executar em producao.
2. Fazer backup/snapshot conforme o procedimento operacional do projeto.
3. Inventariar assinaturas, overloads, RLS, policies e grants atuais. Comparar com `workspace/admin-master-superusuarios/divergencias-local-cmiptst.md`.
4. Revisar a migration inteira. Ela deve ser executada como um unico arquivo e uma unica transacao.
5. Executar `20260929_admin_master_operational_superusers.sql` manualmente. Qualquer erro do preflight deve causar rollback integral; nao contornar o erro sem reconciliar o schema real.
6. Executar `20260929_admin_master_operational_validation.sql`, que e somente leitura.
7. Publicar o frontend somente depois de a migration e a validacao funcional terem sido aprovadas no CMIPtst.

## Validacao funcional pos-aplicacao

Usar sessoes reais, uma por role, sem editar JWT nem `auth.uid()`:

- Receptionist: pesquisar/cadastrar paciente, encaminhar, chamar/rechamar senha, definir proxima senha e transferir.
- Doctor: iniciar sessao, operar apenas a propria fila e confirmar que nao ve o seletor delegado.
- Admin: acessar Administracao e Recepcao; selecionar um medico ativo; iniciar sessao; chamar, rechamar e percorrer os estados da fila.
- Master: repetir todo o fluxo de Admin e validar a administracao Master existente.
- Seguranca: tentar as RPCs `admin_*` como anonimo, receptionist e doctor; usar medico inexistente/inativo; usar fila de outro medico. Todas devem falhar.
- Auditoria: conferir que `medical_queue.created_by`, `queue_history.performed_by`, `patient_calls.called_by` e `delegated_medical_audit.actor_user_id` contem o UUID real do Admin/Master, enquanto `doctor_id` contem o medico selecionado.
- TV/Realtime: em `call` e `recall`, confirmar criacao em `patient_calls` e `patient_call_displays`, recebimento no painel vinculado e atualizacao normal da fila.
- Hierarquia: confirmar que Admin nao lista, promove, altera nem desativa Master; confirmar o comportamento superior ja existente do Master.

## Riscos e recuperacao

- **Schema remoto divergente:** risco principal, pois o banco nao foi auditado remotamente. O preflight foi feito para abortar fechado antes da criacao dos objetos.
- **Overloads legados:** a migration nao os remove nem revoga automaticamente. Devem ser inventariados e avaliados manualmente.
- **Sessao delegada abandonada:** o heartbeat para ao sair do modulo; a disponibilidade expira pela janela existente de 45 segundos. O operador deve usar “Encerrar” para fechamento imediato.
- **Rollback:** em falha durante a execucao, a transacao faz rollback integral. Depois de uma aplicacao concluida, nao apagar objetos automaticamente: primeiro suspender o frontend novo e preparar uma migration de reversao baseada no inventario real, preservando registros de auditoria.

