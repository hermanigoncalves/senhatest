# CMIP Chamador V1 — Relatório de correção e hardening

Data: 2026-09-30.

## Resultado

Esta cópia foi consolidada para uma única aplicação V1. A implementação antiga foi removida do pacote executável, em vez de apenas deixada sem uso pelo frontend.

### Superfície legada removida

- backend Express/Socket.IO e seus proxies;
- APIs antigas `/api/medical`, `/api/ticket`, `/api/reset` e `/api/info`;
- interface antiga (`App.jsx` e componentes legados);
- utilitários Socket.IO e módulos antigos sem uso;
- SQL antigo destrutivo/baseado em bigint;
- workflows e testes que chamavam as APIs removidas;
- dependências diretas de Express, Socket.IO, Pusher e Postgres legado.

O endpoint `/api/tts` foi preservado porque a V1 o utiliza para voz e recebeu validações adicionais.

## Correções funcionais principais

1. Definir senha inicial não gera Broadcast nem anúncio de chamada.
2. Senha inicial e chamada específica não compartilham mais o mesmo estado.
3. Chamadas numéricas e médicas buscam um identificador canônico persistido para deduplicação.
4. Chamada médica sempre usa o consultório efetivamente ativo na sessão.
5. Modo médico delegado encerra a sessão ao trocar de médico ou sair do módulo.
6. Presença médica diferencia `online`, `reconnecting` e `offline` por confirmação do heartbeat.
7. Botões da fila são limitados por estado e têm trava cliente contra clique repetido.
8. TV separa saúde de API e Realtime e mostra `DEGRADADO` quando apenas a API responde.
9. TV limpa a chamada atual quando o backend informa ausência de chamada.
10. Campainha usa um único mecanismo por tentativa e o TTS tem timeout proporcional ao texto.
11. A ativação de áudio após reload exige um `AudioContext` realmente ativo.
12. Login público deixou de enumerar os slugs dos painéis.
13. A edição de identidade sem backend seguro foi removida da interface.
14. Build de produção sem variáveis Supabase obrigatórias falha explicitamente em vez de apontar silenciosamente para teste.

## Hardening do banco preparado

Arquivo: `supabase/migrations/20260930_v1_runtime_hardening.sql`.

Ele implementa máquina de estados da fila, proteção contra chamadas inválidas/duplicadas, recuperação autorizada do evento canônico e uma RPC pública sanitizada de TV que mascara o nome do paciente no servidor. A RPC completa de estado da TV deixa de ser executável por `anon`.

**Importante:** esta migration foi somente criada no ZIP. Ela não foi executada em CMIPtst nem em produção.

## Testes e validação desta execução

Validações concluídas:

- `node --check` nos arquivos JS/MJS relevantes;
- checagem estrutural dos JSX principais;
- varredura por referências a APIs/componentes legados removidos;
- atualização dos testes E2E para os rótulos/RPCs atuais;
- testes reais contra Supabase agora exigem `E2E_REAL=1` e credenciais via ambiente; não há mais credencial real de fallback no teste.

Validação que ficou pendente por limitação do ambiente:

- `npm ci` completo;
- `npm run build`;
- suíte Playwright/E2E com navegador e Supabase.

O ambiente desta execução não resolve `registry.npmjs.org`; o npm também encerrou com `Exit handler never called!`. Isso não é evidência de falha do código, mas impede classificar o pacote como "build validado" nesta máquina.

## Ordem segura de implantação

1. Fazer backup/branch do estado atual.
2. Em **CMIPtst**, revisar e aplicar `20260930_v1_runtime_hardening.sql`.
3. Confirmar RPCs/views esperadas pela V1 e executar smoke tests no CMIPtst.
4. Em ambiente com acesso ao npm: `npm ci`, testes unitários, `npm run build` e Playwright.
5. Só depois promover o mesmo commit/migrations para produção.

Nunca inserir `service_role`, senhas ou segredos em arquivos `VITE_*`, frontend ou testes versionados.
