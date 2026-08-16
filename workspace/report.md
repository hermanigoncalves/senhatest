# 🕵️‍♂️ Relatório Executivo de Diagnóstico & Auditoria Mantis

## 1. Resumo Executivo da Auditoria

Realizamos a auditoria estática e dinâmica de **100% do código-fonte do sistema CMIP** (15 arquivos inventariados, ~4.500 linhas inspecionadas), cruzando os contratos de dados, endpoints e interfaces com os 4 workflows canônicos.

### Status Geral do Sistema:
- **Painel Administrativo Geral ([`src/components/AdminPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AdminPanel.jsx)):** 🟢 **100% Homologado** (CRUD de Médicos, Consultórios com TV de destino, Usuários e Filas testado e aprovado com 9/9 testes automatizados).
- **Roteamento e Isolamento Multi-TV ([`src/components/TvPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/TvPanel.jsx)):** 🟢 **100% Homologado** (Isolamento total comprovado entre TV Recepção, TV 01 e TV 02).
- **Totem de Autoatendimento ([`src/components/TotemTablet.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/TotemTablet.jsx)):** 🟢 **100% Funcional** (Emissão de senhas N/P e driver Web Bluetooth ESC/POS para Knup KA-1445).
- **Autenticação & Controle de Acesso por Perfil (RBAC):** 🟡 **Pendente de Reforço** (Necessário transformar o Login em tela obrigatória e isolar o acesso restrito por perfil).
- **Sincronização de Guichês no Atendimento de Senhas:** 🟡 **Pendente de Reforço** (Necessário unificar persistência no Supabase para evitar reversão de guichês pelo polling).

---

## 2. Quadro Factual de Achados & Soluções Cirúrgicas

| ID | Achado Factual | Arquivo:Linha | Risco | Solução Cirúrgica |
|:---:|---|---|:---:|---|
| **A-01** | **Falta de Login Obrigatório** | [`src/App.jsx:122-167`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx#L122-L167) | Alto | Implementar Route Guard no `App.jsx`: se `!currentUser`, renderizar obrigatoriamente a Tela de Login para todas as rotas restritas. |
| **A-02** | **Acesso Não Isolado por Perfil** | [`src/App.jsx:89-120`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx#L89-L120) | Médio | Bloquear e redirecionar acessos cruzados (ex: médico tentando acessar `/admin` ou recepção tentando acessar `/medico`). |
| **A-03** | **Conflito de Estado de Guichês no Socket vs Polling** | [`server.js:172`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/server.js#L172) vs [`AttendantPanel.jsx:90`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AttendantPanel.jsx#L90) | Alto | Fazer todas as chamadas do Atendente persistirem no Supabase via `api/ticket.js` antes de disparar o broadcast em tempo real. |
| **A-04** | **Perda da Escolha do Guichê ao Recarregar Tela** | [`AttendantPanel.jsx:20`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AttendantPanel.jsx#L20) | Médio | Gravar e ler `selectedDesk` no `localStorage.getItem('cmip_attendant_desk')`. |

---

## 3. Próximo Passo Imediato de Implementação

Aplicar as correções com execução de testes determinísticos de ponta a ponta (`test_rbac_auth.js` e `test_desks_switching.js`).
