# CMIPtst V1 — Status após hardening

Data: 2026-09-30.
Target de homologação: `CMIPtst` / `echypqclxnztvjicnkbf`.

## Aplicação ativa

- Entrada única: `src/main.jsx -> src/V1App.jsx`.
- Supabase Auth + roteamento por perfil.
- Chamador numérico por RPC.
- Pacientes, recepção, fila médica, sessões e transferência.
- TVs por consultório, Realtime, polling de recuperação, áudio e vídeos institucionais.
- Administração V1 e modo delegado de médico para superusuários.

## Hardening feito nesta cópia

- A geração antiga (Express/Socket.IO, APIs médicas/ticket/reset/info, componentes e testes legados) foi removida.
- O botão "Definir senha inicial" não usa mais o caminho de anúncio da TV.
- Os campos de senha inicial e senha específica possuem estados separados.
- Chamadas usam identificador canônico persistido sempre que disponível.
- O consultório de uma chamada médica é o consultório ativo da sessão, não o valor temporário do seletor.
- Troca de módulo/médico delegado encerra sessão delegada explicitamente.
- Estado de presença médica diferencia online/reconectando/offline.
- TV diferencia API e Realtime, limpa chamada obsoleta e não confia em `sessionStorage` para liberar áudio.
- Campainha não dispara dois mecanismos simultaneamente; TTS não usa mais corte fixo de 2,5 s.
- Login público não enumera painéis de TV.
- Produção falha se as variáveis públicas do Supabase não estiverem configuradas; não cai silenciosamente no projeto de teste.
- Fluxo quebrado de edição de identidade foi retirado da interface até existir backend seguro.

## Banco preparado, ainda não aplicado remotamente

A migration `supabase/migrations/20260930_v1_runtime_hardening.sql` adiciona:

- máquina de estados para a fila médica;
- proteção server-side contra chamada/rechamada inválida ou duplicada em janela curta;
- RPC autenticada para recuperar o evento canônico da última chamada médica;
- publicação Realtime das tabelas de chamadas quando necessário;
- RPC pública de TV com nome do paciente mascarado no servidor;
- retirada do acesso `anon` à RPC interna de estado completo da TV.

Essa migration precisa ser validada e aplicada primeiro no **CMIPtst** antes de publicar o frontend correspondente. Nenhuma alteração remota foi feita durante esta correção.

## Validação local

- Sintaxe JavaScript verificada com `node --check` nos arquivos JS/MJS relevantes.
- Balanceamento estrutural de `V1App.jsx` e `V1TvPanel.jsx` verificado.
- Busca de referências não encontrou rotas executáveis legadas restantes.
- Instalação completa de dependências/build não pôde ser concluída neste ambiente: não há resolução DNS para `registry.npmjs.org` e o npm encerrou com erro interno. Portanto, o pacote ainda precisa passar por `npm ci`, build e E2E em um ambiente com rede antes de produção.
