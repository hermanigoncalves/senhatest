# Topologia de 3 TVs CMIP: TV Recepção (Guichês) + TV Consultórios 01 + TV Consultórios 02

## 📋 Objetivo Declarativo
Implementar a separação estrita e dedicada dos 3 canais de TV independentes do Centro Médico Integrado Piratininga (CMIP):
1. **TV da Recepção** (`/tv-recepcao` ou `tv=recepcao`): Exibe e anuncia com áudio **somente** as senhas da recepção/guichês (Totem / Atendimento).
2. **TV Consultórios 01** (`/tv1` ou `tvId=1`): Exibe e anuncia com áudio **somente** as chamadas dos consultórios médicos apontados para a TV 01.
3. **TV Consultórios 02** (`/tv2` ou `tvId=2`): Exibe e anuncia com áudio **somente** as chamadas dos consultórios médicos apontados para a TV 02.

---

## 🎯 Escopo Estrito

### In-Scope (Fazer Agora - 5 Entregáveis Atômicos)
1. **Isolamento de Canais no Backend (`api/medical.js` & `api/ticket.js`)**:
   - Suporte aos canais `channel = 'recepcao'`, `channel = '1'`, `channel = '2'`, e `channel = 'all'`.
   - Se `channel === 'recepcao'`, retorna apenas dados da tabela `tickets` (senhas dos guichês).
   - Se `channel === '1'` ou `'2'`, retorna apenas dados da tabela `patient_calls` onde `target_tv IN (tvId, 'all')`.
2. **Componente de TV Unificado & Inteligente (`src/components/TvPanel.jsx`)**:
   - Identificação visual imediata do canal da TV no cabeçalho (*TV Recepção - Guichês*, *TV 01 - Consultórios Térreo*, *TV 02 - Consultórios 1º Andar*).
   - Filtragem estrita de áudio e tela: chamadas de guichê tocam apenas na TV da recepção; chamadas médicas tocam apenas na TV médica correspondente.
3. **Roteamento de URLs no Frontend (`src/App.jsx`)**:
   - `/tv-recepcao` ou `?tv=recepcao` -> TV da Recepção.
   - `/tv1` ou `/tv-medica-1` ou `?tvId=1` -> TV Consultórios 01.
   - `/tv2` ou `/tv-medica-2` ou `?tvId=2` -> TV Consultórios 02.
   - `/tv` -> TV Geral (com seletor).
4. **Central de Acesso às TVs no Painel Admin (`src/components/AdminPanel.jsx`) & Recepção (`src/components/ReceptionPanel.jsx`)**:
   - Botões com ícones dedicados para abrir cada uma das 3 TVs em novas abas ou janelas.
5. **Suíte de Testes Automatizados E2E ("Tests as Proof")**:
   - Teste de prova comprovando que uma senha emitida na recepção não toca na TV médica e que uma chamada médica da TV 01 não toca na TV 02 nem na Recepção.

### Out-of-Scope (Depois / Fora de Escopo)
- Hardware de Smart TV físico (os links serão executados nos navegadores de cada TV).
- Integração com sistemas de prontuário eletrônico externo (PEP).

---

## 📐 Contratos de Dados & Interfaces

### Canais de TV Válidos
```typescript
type TvChannel = 'recepcao' | '1' | '2' | 'all';

interface TvResponseDTO {
  success: boolean;
  channel: TvChannel;
  channelTitle: string;
  currentTicket: {
    id: number;
    callId: number;
    patientName?: string;
    number?: string;
    officeName?: string;
    desk?: string;
    doctorName?: string;
    targetTv: TvChannel;
    type: 'Normal' | 'Preferencial';
    timestamp: string;
    isRepeat: boolean;
  } | null;
  history: Array<{
    id: number;
    callId: number;
    patientName?: string;
    number?: string;
    officeName?: string;
    desk?: string;
    doctorName?: string;
    targetTv: TvChannel;
    type: 'Normal' | 'Preferencial';
    timestamp: string;
  }>;
}
```

---

## 🛡️ Modelagem de Ameaças Mantis & Mitigações

| Risco / Ameaça | Superfície de Ataque | Blast Radius | Mitigação Arquitetural |
| :--- | :--- | :--- | :--- |
| **Vazamento Cruzado de Áudio** | Chamada médica tocar na TV da Recepção | Alto (confusão de pacientes) | Dupla barreira: backend filtra a query e o frontend valida `belongsToThisTv(call)` antes de enfileirar áudio |
| **Sobrecarga de Polling** | 3 TVs consultando a cada 2s | Baixo | Cache de chave única em memória (`announcedKeysRef`) e queries indexadas por `target_tv` |
| **Queda de Conexão WebSocket** | Smart TV perde socket | Médio | Polling HTTP resiliente de 2s a 3s com reconexão automática |

---

## 🧪 Plano de Verificação (Tests as Proof)

### Testes Automatizados
- `test_3tvs_isolation.js`:
  1. Emite senha numérica para Guichê 01 -> Valida presença na TV Recepção e AUSÊNCIA nas TVs Médicas 01 e 02.
  2. Médico da Sala 1 chama paciente -> Valida presença na TV Médica 01 e AUSÊNCIA na TV Recepção e TV Médica 02.
  3. Médico da Sala 2 chama paciente -> Valida presença na TV Médica 02 e AUSÊNCIA na TV Recepção e TV Médica 01.

### Verificação Manual
- Abrir simultaneamente 3 abas no navegador:
  - Aba 1: `http://localhost:5173/tv-recepcao`
  - Aba 2: `http://localhost:5173/tv1`
  - Aba 3: `http://localhost:5173/tv2`
- Testar chamadas no painel da Recepção, Atendente e Médico e verificar o isolamento sonoro e visual.
