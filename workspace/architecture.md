# 🏛️ Arquitetura Completa do Sistema CMIP

## 1. Visão Geral da Arquitetura

O sistema adota uma **Arquitetura Híbrida Resiliente (Local Express + Vercel Serverless + Supabase PostgreSQL)**, garantindo que o hospital opere tanto em desenvolvimento local/rede interna com comunicação via WebSockets quanto em produção em nuvem com Serverless REST e Polling adaptativo.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          APLICAÇÃO FRONTEND (Vite + React)                  │
├─────────────────┬───────────────────┬───────────────────┬───────────────────┤
│ 📱 Totem Touch   │ 📺 3 TVs Dedicadas │ 📋 Recepção / Cad │ 👨‍⚕️ Painel Médico │
│ (Autoatendimento│ (Recepção / 1 / 2)│ (Encaminhamento)  │ (Fila Consultório)│
└────────┬────────┴─────────┬─────────┴─────────┬─────────┴─────────┬─────────┘
         │                  │                   │                   │
         └──────────────────┼───────────────────┴───────────────────┘
                            ▼
          ┌───────────────────────────────────┐
          │  CAMADA DE APIS & WEBSOCKETS      │
          │  • /api/medical (Rotas Médicas)   │
          │  • /api/ticket (Senhas / Guichês) │
          │  • Socket.IO (Broadcast Tempo Real│
          └─────────────────┬─────────────────┘
                            ▼
          ┌───────────────────────────────────┐
          │     BANCO DE DADOS SUPABASE       │
          │  • offices (Salas com target_tv)  │
          │  • doctors (Corpo Clínico)        │
          │  • users (Contas & Perfis)        │
          │  • patient_calls (Chamadas Méd.)  │
          │  • tickets (Senhas do Totem)      │
          └───────────────────────────────────┘
```

---

## 2. Roteamento e Isolamento das 3 TVs

| Canal de TV | URL de Acesso | Tipo de Conteúdo Exibido | Filtro SQL / Lógica |
|---|---|---|---|
| **TV Recepção** | `/tv-recepcao` | **Apenas Senhas Numéricas de Guichês** (`P001`, `0002`, etc.) | `desk != 'Aguardando'` da tabela `tickets` |
| **TV 01 (Térreo)** | `/tv1` | **Chamadas Nominais dos Consultórios do Térreo (Ala A)** | `target_tv IN ('1', 'all')` da tabela `patient_calls` |
| **TV 02 (1º Andar)** | `/tv2` | **Chamadas Nominais dos Consultórios do 1º Andar (Ala B)** | `target_tv IN ('2', 'all')` da tabela `patient_calls` |
| **TV Geral** | `/tv` | **Visão Integrada de Todas as Chamadas** | Consolidação de `patient_calls` + `tickets` |

---

## 3. Matriz de Perfis e Permissões (RBAC)

- **`receptionist` (Recepção):** Acesso a `/recepcao` (cadastro de pacientes para médicos) e `/` (atendimento de senhas dos guichês). Sem permissão para `/admin` e `/medico`.
- **`doctor` (Médico):** Acesso exclusivo a `/medico` (fila e chamada do consultório logado). Sem permissão para `/admin` e `/recepcao`.
- **`admin` (Administrador):** Acesso pleno a `/admin`, `/recepcao`, `/medico` e `/`.
- **Público:** `/tablet` (Totem de pacientes) e `/tv*` (Telas de exibição da sala de espera).
