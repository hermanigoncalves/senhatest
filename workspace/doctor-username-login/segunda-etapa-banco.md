# Segunda etapa: mudancas de banco/backend necessarias

Este documento e uma proposta para revisao. Ele nao e uma migration e nao contem SQL executavel.

## Campos

Adicionar a `profiles`:

- `username`: texto canonico, independente do nome completo e editavel somente por Admin/Master.
- `display_name`: texto opcional e editavel, usado para apresentacao. Nao inferir `Dr.` ou `Dra.` sem dado confiavel.

Manter:

- `profiles.id` como UUID tecnico ligado a `auth.users.id`;
- `profiles.full_name` como nome oficial;
- `doctors.id` inalterado;
- `doctors.profile_id` como vinculo entre o medico existente e a identidade autenticada.

## Constraints e indices

- unicidade case-insensitive de `username`;
- armazenamento obrigatoriamente em minusculas;
- comprimento de 3 a 40 caracteres;
- formato permitido: letras ASCII minusculas, numeros e pontos internos;
- proibir espacos, acentos, ponto inicial/final e pontos consecutivos;
- `display_name` deve ser `null` ou texto aparado nao vazio, com limite de tamanho definido;
- impedir que dois profiles sejam vinculados ao mesmo medico e que um profile doctor seja vinculado a mais de um medico;
- backfill de username deve parar em colisoes e exigir revisao manual, nunca sobrescrever.

## Backend/RPCs

1. **Login por username**: endpoint server-side que receba username e senha, normalize o username, resolva a identidade interna sem devolver e-mail privado e autentique pelo Supabase Auth. A chave administrativa, se necessaria para a resolucao, deve existir somente no servidor/Edge Function. Uma RPC anonima que devolva e-mail nao e aceitavel.
2. **Atualizacao de identidade**: RPC/endpoint autenticado para `username` e `display_name`. Deve validar profile ativo, role Admin/Master, formato/unicidade e a regra de que Admin nao administra Master. O executor deve ser auditado por `auth.uid()`.
3. **Redefinicao de senha**: Edge Function/server endpoint autenticado que valide Admin/Master antes de usar a Admin API. Nao deve armazenar, consultar, registrar nem devolver senha existente. Deve preservar a protecao de Master e definir o estado de primeiro acesso quando aplicavel.
4. **Listagens**: ampliar `admin_list_users` e `master_list_resources` para retornar `username` e `display_name`, sem tornar dados privados publicos.
5. **Profile atual**: disponibilizar os novos campos ao proprio usuario apenas quando as policies/RPCs correspondentes estiverem definidas.
6. **Criacao e vinculo**: ao criar identidade para um medico existente, receber explicitamente o `doctor_id`, criar/vincular profile e auth user ao registro existente e nunca inserir outro doctor. A operacao deve detectar medico ja vinculado e abortar.

## RLS e grants

- Nao conceder escrita direta em `profiles` para username/display name pelo browser.
- Preservar RLS e as policies atuais de leitura do proprio profile.
- Conceder `EXECUTE` somente aos papeis necessarios e revogar `PUBLIC`/`anon` das operacoes administrativas.
- Funcoes `SECURITY DEFINER`, quando necessarias, devem usar `search_path=''`, nomes qualificados e validacao interna de `auth.uid()`.
- Registrar alteracoes de username/display name e redefinicoes solicitadas em auditoria sem incluir senha ou token.

## Ordem sugerida

1. Auditar o schema remoto, overloads, RLS, grants e Edge Function atuais.
2. Fazer backup e preparar migration defensiva/idempotente.
3. Adicionar campos/constraints inicialmente de forma compativel com profiles existentes.
4. Gerar sugestoes e revisar manualmente todas as colisoes.
5. Implementar os endpoints seguros e ampliar as listagens.
6. Vincular cada identidade ao `doctor_id` existente, sem criar medico duplicado.
7. Habilitar a integracao frontend preparada.
8. Validar login antigo, login por username, hierarquia, auditoria e todos os fluxos operacionais.

## Riscos

- expor e-mails internos por um resolvedor publico;
- duplicar medico durante a criacao de auth user/profile;
- alterar o UUID ou `doctor_id` durante correcao de nome;
- colisao por acentos, caixa, particulas ou nomes homonimos;
- permitir Admin alterar Master;
- usar service role, Admin API ou senha no navegador;
- implantar o frontend de username antes do backend e bloquear usuarios existentes.

