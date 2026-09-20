# CMIPtst V1 — Implementation Status

Target: `CMIPtst` / `echypqclxnztvjicnkbf`.

## Implementado no código
- Supabase Auth + profile role routing.
- Chamador numérico por RPC.
- Paciente + CPF + CEP editável.
- Encaminhamento e transferência.
- Sessão médica com seleção de consultório disponível.
- Fila médica e ações.
- TV com vídeos institucionais, anúncio por voz e histórico.
- Realtime com refetch ao assinar/reconectar.

## Banco
- UUID preservado.
- RPCs V1 derivam identidade de `auth.uid()`.
- RLS e grants reduzidos.
- Realtime habilitado nas tabelas operacionais.
- N:N TV/consultórios preservado.

## Observação
O SQL legado bigint foi renomeado para `supabase/01_cmip_v1_legacy_bigint_DO_NOT_RUN.sql`.
