# Auditoria read-only: identidade e login

Data: 2026-09-30. Repositorio: `C:\Users\Hermani\Downloads\CMIP`, branch `main`.

Nenhum banco, dashboard, SQL, migration, usuario remoto ou configuracao Supabase foi consultado ou alterado nesta etapa.

## Fluxo ativo

- `src/main.jsx` carrega `src/V1App.jsx`.
- Nao existe `AuthContext` no fluxo ativo. `V1App` usa diretamente `supabase.auth.getSession()` e `supabase.auth.onAuthStateChange()`.
- O login anterior recebia um e-mail e chamava `supabase.auth.signInWithPassword({ email, password })` por `cmipApi.signIn`.
- A sessao autenticada fornece o UUID. `cmipApi.profile()` busca `profiles.id = auth user.id`.
- O contrato frontend do profile e `id, full_name, role, active, must_change_password`.
- Para medico, o vinculo observado nos artefatos locais e `doctors.profile_id -> profiles.id -> auth.users.id`. A identidade operacional e o UUID, nao o nome.

## Administracao encontrada

- `admin_list_users` alimenta a listagem administrativa.
- `admin_update_user` altera atualmente `full_name`, `role` e `active` pelo cliente.
- A criacao de usuario Master usa a Edge Function remota `master-user-admin`; sua implementacao nao esta neste repositorio.
- Admin nao altera Master na interface atual. Master possui a administracao superior existente.
- O primeiro acesso permite ao proprio usuario alterar a senha com `supabase.auth.updateUser`, seguido de `complete_first_password_change`.
- Nao existe integracao local segura para redefinicao privilegiada de senha.

## Dependencias de e-mail

- Autenticacao atual por e-mail/senha.
- Formulario Master de criacao de usuario.
- Retorno/listagem de `admin_list_users` e recursos de medicos.
- O e-mail nao participa de filas, sessoes medicas, chamadas, Realtime ou relacao do medico com o profile.

## Codigo legado

O fluxo antigo baseado em `App.jsx`, componentes legados, Socket.IO e API propria foi removido desta copia em 2026-09-30. O unico fluxo de aplicacao preservado e `src/main.jsx -> src/V1App.jsx`.

## Lacunas confirmadas localmente

- Ausencia de `profiles.username` e `profiles.display_name` no contrato frontend.
- Ausencia de resolvedor seguro `username -> identidade Auth`.
- Ausencia de operacao segura para Admin/Master editar username/display name.
- Ausencia de operacao server-side para redefinicao administrativa de senha.
- Definicoes remotas das RPCs administrativas e da Edge Function nao estao integralmente materializadas no repositorio.

