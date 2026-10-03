# CMIPtst — Admin/Master full operational access

Correções aplicadas em 03/10/2026:

- Restauradas as RPCs de atuação médica delegada para Admin/Master.
- Admin e Master podem listar consultórios, iniciar/encerrar sessão delegada, heartbeat, ler fila e executar ações médicas.
- Admin passa a receber a mesma interface global de recursos do Master (usuários, médicos, consultórios, guichês e TVs).
- RPCs globais de recursos aceitam Admin e Master.
- Criação de usuários pela Edge Function `master-user-admin` aceita Admin e Master; Master continua protegido contra alterações sensíveis por Admin.
- Reset de senha no frontend usa a mesma Edge Function administrativa e senha temporária `CMIP123456`, exigindo troca no próximo acesso.
- Contas Master continuam protegidas contra alteração por Admin para evitar bloqueio administrativo acidental.

Ambiente alterado: somente CMIPtst (`echypqclxnztvjicnkbf`).
Produção não alterada.
