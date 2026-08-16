# Plano de Implementação — Correção de Roteamento, Backend Local & Refinamento CMIP

Este plano detalha as correções necessárias para integrar os módulos desenvolvidos (Médico, Recepção, Admin, Login), compatibilizar o servidor local Express (`server.js`) com as APIs serverless e garantir conformidade com os padrões de design e estabilidade dos workflows Mantis e Hallmark.

---

## 🎯 Objetivo Declarativo

Integrar o roteamento de telas no frontend ([`src/App.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx)), habilitar os endpoints de atendimento médico e tickets no servidor local ([`server.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/server.js)), adicionar botão de alternância de painel no [`AttendantPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AttendantPanel.jsx) e validar todo o ciclo operacional com testes automatizados.

---

## 📋 Escopo Estrito (In-Scope vs Out-of-Scope)

### ✅ In-Scope (Fazer Agora — 5 Entregáveis Atômicos)
1. **[ROUT-01] Roteamento Completo & Gestão de Sessão ([`src/App.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx))**:
   - Conectar [`DoctorPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/DoctorPanel.jsx), [`ReceptionPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/ReceptionPanel.jsx), [`AdminPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AdminPanel.jsx) e [`LoginModal.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/LoginModal.jsx).
   - Suporte a rotas por URL (`/medico`, `/recepcao`, `/admin`, `/login`, `/tablet`, `/tv-recepcao`, `/tv1`, `/tv2`, `/tv`).
   - Persistência de sessão do usuário logado via `localStorage` com controle de logout.
2. **[NAV-01] Atalho de Acesso aos Painéis no Painel do Atendente ([`src/components/AttendantPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AttendantPanel.jsx))**:
   - Adicionar botão "Acessar Módulos / Login" no cabeçalho para permitir transição rápida entre a fila de senhas, recepção, consultório e admin.
3. **[SRV-01] Montagem de APIs no Servidor Express Local ([`server.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/server.js))**:
   - Montar `medicalHandler` e `ticketHandler` nas rotas `/api/medical` e `/api/ticket` no Express.
   - Garantir paridade total entre desenvolvimento local (`npm run dev` + `npm run server`) e deploy Vercel.
4. **[UI-01] Refinamento de Estados Hallmark nos Painéis**:
   - Garantir feedback de carregamento suave (Skeletons/Spinners) e tratamento de erros de rede nos modais e listas.
5. **[TEST-01] Suíte de Testes de Roteamento e Endpoints**:
   - Criar e executar teste automatizado comprovando o funcionamento dos endpoints no servidor local e o roteamento de perfil.

### 🚫 Out-of-Scope (Depois / Fora de Escopo)
- Alterações no esquema DDL do Supabase (o banco já está estruturado e validado).
- Modificação na rotina de áudio e sintetizador de voz (já homologados e estáveis).
- Alteração nos drivers ESC/POS da impressora KA-1445.

---

## 🛡️ Modelagem de Ameaças Mantis & Mitigações

| Ameaça / Risco | Superfície | Blast Radius | Mitigação Arquitetural |
|---|---|---|---|
| **Acesso Não Autorizado a Painel Médico/Admin** | Rota `/admin` ou `/medico` digitada na URL | Alto (exposição de dados de pacientes) | Redirecionamento automático para o `LoginModal` se `currentUser` for nulo ou perfil incompatível. |
| **Incompatibilidade de Portas no Proxy do Vite** | Chamadas `/api/*` em ambiente dev local | Médio (404 em todas as ações) | Handler centralizado montado no Express do `server.js` escutando na porta 3001. |
| **Perda de Estado ao Recarregar a Página (F5)** | Usuário logado médico/recepção | Baixo (inconveniência de re-login) | Inicialização síncrona do estado do usuário a partir de `localStorage.getItem('cmip_user')`. |

---

## 📐 Contratos de Interfaces & Rotas

### Matriz de Mapeamento de Rotas (`src/App.jsx`)

```typescript
// Mapeamento Canônico de URLs:
// - '/tv-recepcao' | '?tv=recepcao' ➔ <TvPanel initialTvId="recepcao" />
// - '/tv1' | '?tv=1'                ➔ <TvPanel initialTvId="1" />
// - '/tv2' | '?tv=2'                ➔ <TvPanel initialTvId="2" />
// - '/tv' | '?tv=all'               ➔ <TvPanel initialTvId="all" />
// - '/tablet' | '/totem'            ➔ <TotemTablet />
// - '/login'                        ➔ <LoginModal />
// - '/medico'                       ➔ <DoctorPanel /> (ou Login se deslogado)
// - '/recepcao'                     ➔ <ReceptionPanel /> (ou Login se deslogado)
// - '/admin'                        ➔ <AdminPanel /> (ou Login se deslogado)
// - '/' (Padrão)                    ➔ <AttendantPanel /> (com botão para Login)
```

---

## 🔨 Decomposição Atômica de Tarefas

```markdown
1. [MODIFY] src/App.jsx (~5 min) ➔ Adicionar importações de DoctorPanel, ReceptionPanel, AdminPanel, LoginModal e roteador com localStorage.
2. [MODIFY] server.js (~3 min) ➔ Importar api/medical.js e api/ticket.js e registrar app.all('/api/medical') e app.all('/api/ticket').
3. [MODIFY] src/components/AttendantPanel.jsx (~3 min) ➔ Adicionar botão no cabeçalho para navegar para o Login/Módulos Médicos.
4. [NEW] test_routes_integration.js (~4 min) ➔ Teste automatizado validando os endpoints do servidor local.
5. [VERIFY] Execução das suítes de teste (~2 min) ➔ Executar node test_routes_integration.js e test_3tvs_isolation.js.
```

---

## 🧪 Plano de Verificação (Tests as Proof)

### 1. Testes Automatizados
- Executar `node test_routes_integration.js` para comprovar que `/api/medical` e `/api/ticket` respondem com sucesso (200 OK) no backend.
- Re-executar `node test_3tvs_isolation.js` para assegurar que nenhuma regressão afetou o isolamento das 3 TVs.

### 2. Verificação Visual e Manual
- Testar acesso via navegador nas rotas:
  - `http://localhost:5173/` ➔ Painel de Atendimento com atalhos.
  - `http://localhost:5173/login` ➔ Modal de Login com atalhos de perfil.
  - `http://localhost:5173/recepcao` ➔ Painel de Cadastro e Encaminhamento de Pacientes.
  - `http://localhost:5173/medico` ➔ Painel de Atendimento do Médico e Chamada de Fila.
  - `http://localhost:5173/admin` ➔ Painel Administrativo Geral.
  - `http://localhost:5173/tv1`, `http://localhost:5173/tv2`, `http://localhost:5173/tv-recepcao`.

---

## 🛑 Portão de Confirmação

Após a sua aprovação deste plano, iniciaremos a aplicação imediata das modificações em [`src/App.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx), [`server.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/server.js) e [`src/components/AttendantPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AttendantPanel.jsx).
