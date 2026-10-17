# Plano — simplificar a interface do CMIP Chamador

Objetivo: cada tela com **uma ação principal óbvia**, menos caixas e menos botões, sem perder nenhuma função.
A TV fica fora deste plano (acabou de ser corrigida e já é simples).

## O que pesa hoje

| Tela | Problema | Onde |
|---|---|---|
| Recepção | Tudo aparece de uma vez: 6 caixas de chamada + encaminhamento + busca + cadastro + transferência numa só página | `Reception.jsx`, `TicketCaller.jsx` |
| Recepção | "Definir senha inicial" (apaga histórico, irreversível) fica ao lado do botão de chamar | `TicketCaller.jsx:197` |
| Recepção | Lista de médicos para "Encaminhar" aparece duplicada (por senha e por paciente), com o mesmo visual | `Reception.jsx:170` e `:260` |
| Recepção | "Senha exibida na TV" e "Últimas chamadas" são duas caixas para a mesma informação | `TicketCaller.jsx:283-310` |
| Recepção | Texto decorativo ("Praticidade e agilidade no atendimento.") | `TicketCaller.jsx:232` |
| Médico | Cada paciente tem **6 botões** (Chamar, Rechamar, Iniciar, Ausente, Finalizar, Aguardando), a maioria desabilitada | `Doctor.jsx:293-328` |
| Médico | Status aparece em inglês cru (`waiting`, `called`…) | `Doctor.jsx:290`, `Reception.jsx:428` |
| Médico | Seletor de consultório + "Iniciar/mudar" + "Encerrar" ficam sempre visíveis, mesmo com sessão ativa | `Doctor.jsx:252-272` |
| Todas | Papel do usuário em inglês no cabeçalho (`DOCTOR`, `RECEPTIONIST`) | `Shell.jsx:25` |
| Admin/Master | Duas barras de navegação empilhadas (módulos + abas do Admin) e cabeçalho repetido abaixo da barra | `SuperuserWorkspace.jsx`, `Shell.jsx` |
| Visual | Caixa dentro de caixa, gradientes, rótulos em CAIXA ALTA espaçada, 5 cores de destaque (verde, âmbar, rosa, vermelho, esmeralda) | `ui.jsx`, todas as telas |

## Fase 1 — Limpeza rápida (baixo risco, 1 PR)

1. Traduzir status e papéis num só lugar (`utils/labels.js`): `waiting → Aguardando`, `called → Chamado`,
   `in_service → Em atendimento`, `doctor → Médico`, `receptionist → Recepção` etc.
2. Remover textos decorativos e rótulos repetidos.
3. Criar um componente único `DoctorPicker` (lista compacta: nome · especialidade · consultório · botão) e usar
   nos dois pontos de encaminhamento.
4. Tirar caixas internas: itens de lista viram linhas com divisória, não cartões dentro de cartões.
5. Reduzir cores: verde CMIP = ação, vermelho = destrutivo/erro, âmbar = aviso. Sem gradientes.

## Fase 2 — Recepção em duas colunas claras

```
┌──────────── CHAMAR ─────────────┐ ┌──────── ENCAMINHAR ─────────┐
│ Guichê 2 ▾            ⚙ ajustes │ │ [ Senha, nome ou CPF     ]  │
│                                 │ │                             │
│   Próxima: 0152                 │ │  → escolher médico (lista)  │
│ [  CHAMAR PRÓXIMA  ] [RECHAMAR] │ │                             │
│ Chamar nº: [____] [Chamar]      │ │  + Cadastrar paciente       │
│                                 │ │    (só se a busca não achar)│
│ Na TV: 0151 · Guichê 2          │ ├─────────────────────────────┤
│ 0150 · 0149 · 0148 (histórico)  │ │ ▸ Filas dos médicos (abrir) │
└─────────────────────────────────┘ └─────────────────────────────┘
```

- **Guichê** vai para o topo da coluna e fica lembrado no aparelho.
- **Definir senha inicial** sai da tela principal → menu "⚙ ajustes do guichê", com confirmação
  ("Isso apaga o histórico de chamadas do Guichê 2. Digite a senha inicial para confirmar").
- **"Na TV" + "Últimas chamadas"** viram um bloco só: a atual em destaque e as 4 anteriores em linha.
- **Encaminhar** ganha um campo único: se for número → senha (SENHA-0045); se for texto → busca paciente.
  Um caminho só em vez de dois blocos separados.
- **Transferência** vira seção recolhível "Filas dos médicos" (é usada de vez em quando, não a todo minuto).

## Fase 3 — Médico: um botão por paciente

- Cada linha mostra **só a próxima ação** conforme o status:
  - Aguardando → **Chamar**
  - Chamado → **Iniciar atendimento** (+ menu ⋯: Rechamar, Ausente, Voltar para aguardando)
  - Em atendimento → **Finalizar**
- O primeiro paciente aguardando fica em destaque no topo ("Próximo: Maria S.").
- Com sessão ativa, o topo vira uma linha: `● Online · Consultório 3  [trocar] [encerrar]`.
  O seletor de consultório só aparece sem sessão ou ao clicar em "trocar".
- Para Admin/Master atuando como médico: o seletor de médico e o aviso "Contexto delegado" viram uma faixa só.

## Fase 4 — Admin/Master

- Uma navegação só: módulos (Administração, Recepção, Atuar como médico) na barra; abas do Admin como
  sub-itens dentro de Administração. Sem cabeçalho repetido embaixo da barra.
- Redefinir senha e ações perigosas sempre em vermelho, com confirmação.

## Como verificar

- Os testes E2E existentes continuam passando (ajustando seletores de texto quando o rótulo mudar).
- Teste manual no CMIPtst por tela: chamar 3 senhas, rechamar, chamar número específico, encaminhar por senha,
  encaminhar paciente cadastrado, médico chamar → iniciar → finalizar, transferir.
- Medir: número de cliques para "chamar próxima" (meta 1) e para "encaminhar senha ao médico" (meta 2).

## Fora do escopo

TV, regras de negócio, banco de dados e Edge Functions. Nenhuma função é removida, só reorganizada.
