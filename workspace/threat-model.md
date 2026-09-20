# 🛡️ Modelagem de Ameaças Google Mantis (Threat Model)

## 1. Superfície de Ataque & Riscos Mapeados

| # | Ameaça / Vetor | Componente Afetado | Severidade | Causa-Raiz Técnica | Impacto |
|:---:|---|---|:---:|---|---|
| **T-01** | Acesso Anônimo a Telas Operacionais | [`src/App.jsx:122-167`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx#L122-L167) | **ALTA (P1)** | Falta de guarda de rota estrita que bloqueie o acesso a `/` ou `/recepcao` sem login prévio. | Operador não identificado pode realizar chamadas ou alterar cadastros sem auditoria. |
| **T-02** | Acesso Cruzado Não Autorizado (Privilege Escalation) | [`src/App.jsx:90-120`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx#L90-L120) | **MÉDIA (P2)** | Médico ou recepcionista navegando diretamente por URL para rotas de outros perfis sem barreira rígida de permissão. | Médico acessando painel administrativo ou recepção acessando consultório médico. |
| **T-03** | Dessincronização de Guichês por Conflito de Estado | [`server.js:172`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/server.js#L172) vs [`api/ticket.js:414`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/api/ticket.js#L414) | **ALTA (P1)** | `server.js` salvando chamadas apenas em memória RAM enquanto polling do frontend lê do Supabase. | Chamada de Guichê 02 sendo revertida para Guichê 01 após 2 segundos de polling. |
| **T-04** | Perda de Seleção do Guichê no Terminal do Operador | [`src/components/AttendantPanel.jsx:20`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AttendantPanel.jsx#L20) | **MÉDIA (P2)** | `selectedDesk` mantido em estado volátil do React sem persistência no `localStorage`. | Recarregamento de página faz o Guichê 02 voltar para Guichê 01. |

---

## 2. Estratégia de Mitigação Obrigatória

1. **Implementar Route Guard Central no `src/App.jsx`:**
   - Se `!currentUser` e a rota não for pública (`/tablet`, `/totem`, `/tv*`), renderizar obrigatoriamente a Tela de Login.
   - Restringir estritamente as rotas renderizadas conforme `currentUser.role`.
2. **Unificar Persistência no Supabase em Todas as Ações:**
   - Garantir que o `AttendantPanel.jsx` chame os endpoints persistidos no Supabase antes ou durante a emissão de sockets.
3. **Persistir `selectedDesk` no `localStorage`:**
   - Garantir que cada computador de guichê memorize seu próprio número de guichê.
