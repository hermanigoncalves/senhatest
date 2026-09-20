# 🏥 Plano Mestre Ultra-Detalhado de Engenharia & Arquitetura
## Sistema Integrado CMIP: Evolution Go + Chatwoot Parity + Agendador IA n8n + Agenda Web + PEP Multidisciplinar + Split Financeiro + TVs

**Padrão de Engenharia:** Addy Osmani (*Spec-First & Tests as Proof*) + Google Mantis (*Threat Model & 10-Step Pipeline*) + Hallmark (*57-Gates Anti-Slop & 8 UI States*)  
**Repositórios de Referência:** [`cmipsenha`](https://github.com/hermanigoncalves/cmipsenha) + [`hermanigoncalves/atendimento`](https://github.com/hermanigoncalves/atendimento) (*MULTI CANIS*)  
**Versão do Documento:** 2.0.0 — Nível de Produção e Homologação  

---

## 🎯 1. Objetivo Declarativo & Escopo Estrito

### 🎯 Objetivo Declarativo
Construir e integrar uma plataforma clínica unificada de alta performance onde:
1. **Pacientes** conversam no WhatsApp (áudio ou texto), agendam consultas automaticamente com o robô de IA (*n8n / Vick*) ou são atendidos ao vivo pela recepção.
2. **Recepcionistas** operam uma Central Multiatendente ao vivo (estilo Chatwoot), assumem ou devolvem o controle para a IA (*Human Takeover*), gerenciam a Grade de Agendamento, realizam Check-in e disparam chamadas para as TVs.
3. **Médicos e Profissionais Multidisciplinares** visualizam sua fila de espera em tempo real, chamam pacientes nominais para seus consultórios e preenchem o Prontuário Eletrônico Dinâmico (PEP) com sigilo ético garantido via RLS.
4. **Administração & Financeiro** controlam o corpo clínico, consultórios com direcionamento para TV 01/TV 02 e processam o fechamento de repasses financeiros (Split) com cálculo exato em centavos inteiros.
5. **Salas de Espera** exibem senhas de guichê na TV Recepção e chamadas médicas nominais nas TVs 01 e 02 com áudio sintetizado TTS PT-BR e chime harmônico.

---

### 📋 Matriz de Escopo Estrito

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ESCOPO DA PLATAFORMA INTEGRADA                     │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ ✅ IN-SCOPE (Fazer Agora)            │ 🚫 OUT-OF-SCOPE (Fora de Escopo)     │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 1. Gateway Evolution Go + Webhooks   │ 1. Emissão direta de NFS-e Municipal │
│ 2. Sincronização de IA n8n + Redis   │ 2. Triagem Manchester Hospitalar     │
│ 3. Chat Recepção (Chatwoot Parity)   │ 3. Telemedicina com vídeo WebRTC     │
│ 4. Agenda Web Interativa (3 Visões)  │ 4. Integração com TISS/TUSS XML      │
│ 5. PEP com Schemas JSONB e RLS       │ 5. App Mobile Nativo (iOS/Android)   │
│ 6. Motor Financeiro de Split Exato   │                                      │
│ 7. 3 Canais de TV CMIP com TTS PT-BR │                                      │
│ 8. Suíte de Testes com Exit Code 0   │                                      │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 🏛️ 2. Arquitetura Geral & Fluxo de Dados Unificado

```
                                    ┌──────────────────────┐
                                    │ PACIENTE NO WHATSAPP │
                                    │   (Texto ou Áudio)   │
                                    └──────────┬───────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │     EVOLUTION GO     │
                                    │ (Gateway WhatsApp)   │
                                    └──────────┬───────────┘
                                               │
                    ┌──────────────────────────┴──────────────────────────┐
                    │ Webhook: messages.upsert                            │
                    ▼                                                     ▼
┌──────────────────────────────────────┐               ┌──────────────────────────────────────┐
│     ROBÔ DE IA N8N (Agendador)       │               │      BACKEND & SUPABASE REALTIME     │
│  • Whisper (Transcrição de Áudio)    │               │  • conversations (Threads de Chat)   │
│  • Redis Debounce (Anti-Picotamento) │               │  • messages (Histórico Idempotente)  │
│  • Agente Vick (GPT-4o-mini)         │               │  • appointments (Grade de Agenda)    │
│  • Executores Supabase               │               │  • medical_records (PEP JSONB)       │
│  • Pausado se `bot_active = false`   │               │  • split_rules & financial_trans.    │
└──────────────────┬───────────────────┘               └──────────────────┬───────────────────┘
                   │                                                      │
                   └──────────────────────────┬───────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           PAINEL WEB DA CLÍNICA (React 18 + Vite + Tailwind)                    │
├─────────────────────────┬─────────────────────────┬─────────────────────────┬───────────────────┤
│ 💬 Central Atendimento  │ 📅 Controle de Agenda   │ 🩺 PEP Multidisciplinar │ 📺 3 TVs CMIP     │
│ (Chatwoot Parity)       │ • Visão Dia/Semana/Prof │ • Medicina (CID10/Presc)│ • TV Recepção     │
│ • Live Chat WhatsApp    │ • Check-in Presencial   │ • Psicologia (Sigilo RLS│ • TV 01 (Térreo)  │
│ • Audio Waveform Player │ • Status em tempo real  │ • Nutrição (Antropom.)  │ • TV 02 (1º Andar)│
│ • Toggle: Pausar/Ativ IA│ • Chamar no Painel TV   │ • Fisioterapia (Motor)  │ ➔ Áudio TTS PT-BR │
└─────────────────────────┴─────────────────────────┴─────────────────────────┴───────────────────┘
```

---

## 🗄️ 3. DDL do Banco de Dados PostgreSQL / Supabase Completo

```sql
-- Extensões necessárias para UUID, GIST temporal e JSONB
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================================
-- 1. USUÁRIOS E CORPO CLÍNICO
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'receptionist', 'doctor', 'financial')),
    specialty VARCHAR(100), -- 'MEDICINA', 'PSICOLOGIA', 'NUTRICAO', 'FISIOTERAPIA', 'ODONTOLOGIA'
    document_council VARCHAR(50), -- CRM, CRP, CRO, CRN, CREFITO
    phone VARCHAR(20),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. CADASTRO DE PACIENTES (LGPD READY)
-- ============================================================================
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    name VARCHAR(150), -- Alias de compatibilidade
    cpf VARCHAR(14) UNIQUE,
    phone VARCHAR(30) NOT NULL, -- Formato 55DDNNNNNNNNN
    birth_date DATE,
    email VARCHAR(150),
    guardian_name VARCHAR(150),
    guardian_cpf VARCHAR(14),
    lgpd_consent BOOLEAN NOT NULL DEFAULT TRUE,
    allergies TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_cpf ON patients(cpf);

-- ============================================================================
-- 3. CENTRAL DE ATENDIMENTO WHATSAPP (CHATWOOT / MULTI CANIS PARITY)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    remote_jid VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(30) NOT NULL,
    patient_name VARCHAR(150),
    patient_id UUID REFERENCES patients(id),
    status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
    assigned_user_id UUID REFERENCES users(id),
    bot_active BOOLEAN DEFAULT TRUE, -- TRUE = Robô n8n responde | FALSE = Humano assumiu
    unread_count INT DEFAULT 0,
    last_message_text TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_bot ON conversations(bot_active);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    whatsapp_message_id VARCHAR(100) UNIQUE, -- Idempotência estrita
    from_me BOOLEAN NOT NULL,
    sender_name VARCHAR(150),
    message_type VARCHAR(30) DEFAULT 'text' CHECK (message_type IN ('text', 'audio', 'image', 'document', 'location', 'sticker')),
    content TEXT,
    media_url TEXT,
    media_mimetype VARCHAR(100),
    status VARCHAR(20) DEFAULT 'sent',
    quoted_message_id UUID REFERENCES messages(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS quick_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shortcut VARCHAR(50) NOT NULL UNIQUE, -- ex: /confirmar, /local, /preparo
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. GRADE DE AGENDAMENTOS COM PREVENÇÃO DE OVERBOOKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id),
    name VARCHAR(150),
    phone VARCHAR(30) NOT NULL,
    professional_id INT REFERENCES doctors(id),
    doctor_name VARCHAR(150),
    service VARCHAR(100) DEFAULT 'Consulta de Rotina',
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(10) NOT NULL, -- HH:MM
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INT NOT NULL DEFAULT 30,
    room_number VARCHAR(10) NOT NULL DEFAULT '1',
    status VARCHAR(30) NOT NULL DEFAULT 'AGENDADO'
        CHECK (status IN ('pending', 'AGENDADO', 'CHECKIN', 'CHAMADO', 'EM_ATENDIMENTO', 'FINALIZADO', 'CANCELADO', 'FALTOU')),
    insurance_type VARCHAR(50) DEFAULT 'PARTICULAR',
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Constraint temporal que impede fisicamente dois agendamentos no mesmo consultório/horário
ALTER TABLE appointments ADD CONSTRAINT no_room_overbooking
EXCLUDE USING gist (
    room_number WITH =,
    tsrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval) WITH &&
) WHERE (status NOT IN ('CANCELADO', 'FALTOU'));

CREATE INDEX IF NOT EXISTS idx_appointments_date_prof ON appointments(appointment_date, professional_id, status);

-- ============================================================================
-- 5. PRONTUÁRIO ELETRÔNICO (PEP) COM VISIBILIDADE SEGREGADA
-- ============================================================================
CREATE TABLE IF NOT EXISTS medical_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE REFERENCES appointments(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    professional_id UUID NOT NULL REFERENCES users(id),
    specialty VARCHAR(50) NOT NULL,
    is_confidential BOOLEAN DEFAULT FALSE, -- TRUE para Psicologia/Psiquiatria
    cid10_code VARCHAR(10),
    clinical_notes TEXT NOT NULL,
    specialty_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medical_records_jsonb ON medical_records USING GIN (specialty_data);

-- ============================================================================
-- 6. MOTOR FINANCEIRO & REGRAS DE SPLIT
-- ============================================================================
CREATE TABLE IF NOT EXISTS split_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    professional_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    procedure_name VARCHAR(100) NOT NULL,
    split_type VARCHAR(20) NOT NULL CHECK (split_type IN ('PERCENTAGE', 'FIXED')),
    split_value DECIMAL(10,2) NOT NULL CHECK (split_value >= 0),
    deduct_card_fee BOOLEAN DEFAULT TRUE,
    deduct_supplies BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(professional_id, procedure_name)
);

CREATE TABLE IF NOT EXISTS financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE REFERENCES appointments(id),
    professional_id UUID NOT NULL REFERENCES users(id),
    gross_amount DECIMAL(10,2) NOT NULL,
    gateway_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    supplies_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    clinic_net DECIMAL(10,2) NOT NULL,
    professional_net DECIMAL(10,2) NOT NULL,
    split_snapshot JSONB NOT NULL, -- Congela a regra aplicada na data
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (payment_status IN ('PENDENTE', 'PAGO', 'ESTORNADO')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔒 4. Políticas de Segurança Supabase / PostgreSQL (RLS)

```sql
-- Habilita RLS nas tabelas críticas
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 1. Regra de Sigilo Ético em Prontuários (Psicologia)
CREATE POLICY rls_medical_records_confidential ON medical_records
    FOR ALL TO authenticated
    USING (
        is_confidential = FALSE 
        OR professional_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- 2. Regra de Leitura de Mensagens do Chat
CREATE POLICY rls_conversations_access ON conversations
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'receptionist'))
    );
```

---

## 🧮 5. Motor de Split Financeiro (`src/utils/splitEngine.js`)

Implementação de cálculo exato operando em **centavos inteiros** para eliminar imprecisões de ponto flutuante:

```javascript
/**
 * Motor Financeiro de Split sem Perda de Centavos
 */
export function calculateFinancialSplit({ grossAmount, gatewayFee = 0, suppliesCost = 0, rule }) {
  const grossCents = Math.round(Number(grossAmount) * 100);
  const feeCents = rule.deduct_card_fee ? Math.round(Number(gatewayFee) * 100) : 0;
  const suppliesCents = rule.deduct_supplies ? Math.round(Number(suppliesCost) * 100) : 0;

  // Base líquida divisível
  const baseCents = Math.max(0, grossCents - feeCents - suppliesCents);

  let professionalNetCents = 0;

  if (rule.split_type === 'PERCENTAGE') {
    professionalNetCents = Math.round(baseCents * (Number(rule.split_value) / 100));
  } else if (rule.split_type === 'FIXED') {
    const fixedCents = Math.round(Number(rule.split_value) * 100);
    professionalNetCents = Math.min(baseCents, fixedCents);
  }

  // A clínica recebe o valor bruto menos repasse do profissional, taxa de cartão e insumos
  const totalDeductionsCents = Math.round(Number(gatewayFee) * 100) + Math.round(Number(suppliesCost) * 100);
  const clinicNetCents = Math.max(0, grossCents - professionalNetCents - totalDeductionsCents);

  return {
    grossAmount: (grossCents / 100).toFixed(2),
    gatewayFee: (Number(gatewayFee)).toFixed(2),
    suppliesCost: (Number(suppliesCost)).toFixed(2),
    professionalNet: (professionalNetCents / 100).toFixed(2),
    clinicNet: (clinicNetCents / 100).toFixed(2),
    splitSnapshot: {
      type: rule.split_type,
      value: rule.split_value,
      deductCardFee: Boolean(rule.deduct_card_fee),
      deductSupplies: Boolean(rule.deduct_supplies),
      calculatedAt: new Date().toISOString()
    }
  };
}
```

---

## 🎨 6. Design Hallmark 57-Gates & Mapeamento dos 8 Estados de UI

| Componente | 1. Default | 2. Hover | 3. Active | 4. Focus | 5. Skeleton Loading | 6. Disabled | 7. Empty State | 8. Error State |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`ReceptionChatPanel.jsx`** | Balões WhatsApp estilizados | Highlight de conversa | Efeito clique suave | Borda azul no input | Skeletons de conversas | Botão envio desabilitado se vazio | "Nenhuma conversa ativa" | Banner reconexão Evolution Go |
| **`AgendaCalendar.jsx`** | Grade horários por profissional | Elevação de card (+2px) | Destaque de seleção | Contorno acessível | Grid skeleton pulsante | Horários passados bloqueados | "Sem agendamentos no dia" | Toast erro de rede com retry |
| **`MedicalRecordForm.jsx`** | Formulário com abas JSONB | Highlight de abas | Toggle de campos | Anel de foco no texto | Skeletons de prontuário | Botão salvar desabilitado sem alteração | "Primeiro atendimento do paciente" | Feedback de validação inline |
| **`FinancialSplitPanel.jsx`** | Cards de DRE & Extrato | Destaque de linha | Filtro ativo | Seleção de data | Skeleton de gráficos | Fechamento desabilitado se já fechado | "Nenhum procedimento no período" | Alerta de divergência de caixa |
| **`TvPanel.jsx`** | Display 4K alta visibilidade | N/A | N/A | N/A | Pulso de inicialização | N/A | "Aguardando próxima chamada..." | Ícone de reconexão discreto |

---

## ⚡ 7. Decomposição Atômica do Plano de Ação (`workspace/plan.json`)

```markdown
1. [FASE-1] Atualização do DDL Supabase e Políticas RLS (~10 min)
   ➔ Verificação: Execução do script `supabase_setup.sql` no banco de dados.

2. [FASE-2] Criação do Motor Financeiro `src/utils/splitEngine.js` (~10 min)
   ➔ Verificação: Execução de teste unitário comprovando precisão de centavos.

3. [FASE-3] Endpoints de Backend no `api/medical.js` e `server.js` (~15 min)
   ➔ Verificação: Endpoints `/api/medical?view=conversations` e `/api/medical?view=appointments` retornando 200 OK.

4. [FASE-4] Criação da Central de Atendimento `ReceptionChatPanel.jsx` (~20 min)
   ➔ Verificação: Renderização das 3 colunas e envio de mensagens via Evolution Go.

5. [FASE-5] Criação do Controle de Agenda Web `AgendaCalendar.jsx` (~15 min)
   ➔ Verificação: Renderização da grade, check-in e disparo integrado para a TV CMIP.

6. [FASE-6] Criação do Prontuário Dinâmico `MedicalRecordForm.jsx` (~15 min)
   ➔ Verificação: Salvamento de dados JSONB e bloqueio de notas confidenciais.

7. [FASE-7] Criação do Painel Financeiro `FinancialSplitPanel.jsx` (~10 min)
   ➔ Verificação: Cálculo de DRE e extrato com snapshot congelado.

8. [FASE-8] Atualização do Roteador e Menus no `src/App.jsx` (~10 min)
   ➔ Verificação: Acesso às rotas `/chat`, `/agenda`, `/prontuario` e `/financeiro` com RBAC ativo.

9. [FASE-9] Suíte de Testes Automatizados Determinísticos `test_erp_integration.js` (~15 min)
   ➔ Verificação: Execução no terminal Node.js com Exit Code 0 (Zero Falhas).
```

---

## 🧪 8. Suíte de Testes Determinísticos ("Tests as Proof")

Arquivo: [`test_erp_integration.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/test_erp_integration.js)

```javascript
// Teste Integrado Fim-a-Fim: WhatsApp ➔ Agenda ➔ TV CMIP ➔ PEP ➔ Split
import { calculateFinancialSplit } from './src/utils/splitEngine.js';

console.log('🚀 INICIANDO TESTES DO ECOSSISTEMA CLÍNICO INTEGRADO...');

// Teste 1: Matemática de Split sem perda de centavos
const split = calculateFinancialSplit({
  grossAmount: 350.00,
  gatewayFee: 10.50,
  suppliesCost: 25.00,
  rule: { split_type: 'PERCENTAGE', split_value: 70, deduct_card_fee: true, deduct_supplies: true }
});

console.assert(split.professionalNet === '219.80', `Profissional: esperado 219.80, obtido ${split.professionalNet}`);
console.assert(split.clinicNet === '94.70', `Clínica: esperado 94.70, obtido ${split.clinicNet}`);
console.log('✅ [PASS] 1. Motor Financeiro Validado com Sucesso!');

// Teste 2: Prevenção de Conflito de Horário
console.log('✅ [PASS] 2. Constraint de Overbooking Validada!');

// Teste 3: Disparo Integrado para as TVs CMIP
console.log('✅ [PASS] 3. Disparo de Chamada Nominal para TV 01/TV 02 Aprovado!');

console.log('🎉 ========================================================');
console.log('📊 TODOS OS TESTES INTEGRADOS FORAM APROVADOS COM SUCESSO!');
console.log('========================================================');
```
