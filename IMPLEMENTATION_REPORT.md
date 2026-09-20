# CMIP Chamador V1 — Relatório de implementação

## Entregue no código

- Supabase Auth com sessão persistida e sem credenciais fallback.
- Cliente frontend apenas com URL e chave pública via variáveis de ambiente.
- Chamador numérico com próxima, rechamada, específica, configuração manual e ciclo 0001–1000.
- Contador transacional com bloqueio de linha para concorrência.
- Pacientes com nome/data obrigatórios, CPF opcional validado e único e preenchimento por CEP com fallback manual.
- Sessões médicas com exclusividade por médico e consultório e troca sem perda de fila.
- Fila e histórico de eventos; ações autorizadas por RPC e identidade derivada de `auth.uid()`.
- Estrutura de transferência preservando médico anterior, novo médico, responsável, horário e motivo.
- TVs cadastráveis em relação N:N com consultórios e projeção pública mínima.
- TV com os dois vídeos institucionais, anúncio por voz, deduplicação por evento e retorno ao vídeo.
- Realtime com refetch após assinatura/reconexão.
- RLS ativado nas tabelas expostas e views com `security_invoker`.

## Validação executada

- `npm ci`: aprovado.
- `npm run test:v1`: aprovado (CPF e formatação de senha).
- `npm run build`: aprovado.
- Teste visual local via navegador remoto: bloqueado pela rede do navegador remoto, que não acessa `127.0.0.1`; não foi considerado aprovado.

## Bloqueios e pendências reais

1. O conector Supabase não expôs ferramentas nesta sessão. Nenhum SQL foi executado.
2. É obrigatório confirmar visualmente `CMIPtst`, executar `supabase/00_inventory_read_only.sql`, comparar o inventário e só então adaptar/aplicar `supabase/01_cmip_v1.sql`.
3. Criar os usuários de teste no Supabase Auth e associar médicos antes dos testes E2E.
4. Executar os testes funcionais obrigatórios contra `CMIPtst`, inclusive isolamento RLS, Realtime e concorrência.
5. A chave `service_role` encontrada no ZIP original deve ser rotacionada no painel do projeto correto; removê-la do arquivo não revoga o segredo já exposto.

## Variáveis

Copiar `.env.example` para `.env.local` e preencher somente com os dados de `CMIPtst`. Nunca usar `service_role` no frontend.
