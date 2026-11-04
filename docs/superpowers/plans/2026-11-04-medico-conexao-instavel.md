# Tela do Médico com internet instável — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela do médico deve explicar quedas de internet em português, sair sozinha do erro quando a conexão volta, não mostrar mensagens de outro consultório e avisar antes de deixar uma senha esquecida ao trocar de consultório.

**Architecture:** Um módulo puro `src/utils/errors.js` traduz erros (rede, chamada duplicada) e passa a ser o `err()` usado em todas as telas. `Doctor.jsx` separa o erro de carregamento (`loadError`, que se limpa sozinho com nova tentativa a cada 5 s) das mensagens de ação (`msg`), volta a seleção ao consultório real quando a troca falha e pergunta antes de sair de um consultório com senha pendente. `OfficeTicketList.jsx` zera a mensagem quando o consultório muda.

**Tech Stack:** React 18 + Vite, supabase-js 2, testes de lógica em Node (`test_logic.mjs`, `node:assert/strict`), E2E com Playwright e Supabase simulado (`tests/e2e/support/mocks.js`).

**Spec:** análise dos prints de 04/11/2026, 11:51–11:54 (celular da médica em ligação; `TypeError: Failed to fetch`; "Chamada duplicada bloqueada" aparecendo no Consultório 1; senha 0412 deixada "Chamada" no Consultório 2). Problemas A–E da análise:
- A: erro de carregamento antigo continua na tela com status "Online".
- B: mensagem da lista de senhas de um consultório aparece em outro.
- C: erro técnico em inglês ("TypeError: Failed to fetch") vai direto para a tela.
- D: troca de consultório falha e a seleção continua mostrando o consultório que não abriu.
- E: senha "Chamada"/"Aguardando" fica esquecida no consultório anterior ao trocar.

## Global Constraints

- Todo texto de tela em português do Brasil, sem termos técnicos em inglês.
- Nenhuma migration nova: o bloqueio de 2 s no banco (`Chamada duplicada bloqueada`) continua como está.
- Sem novas dependências npm.
- Comentários no código em português, no estilo dos já existentes.
- `npm run check` (lint + testes de lógica + build) precisa passar ao fim de cada tarefa.
- Commits na branch `claude/adoring-dirac-21a03n`.

## Review Focus

1. Safari/iPhone escreve a queda de rede como `Load failed` e o Firefox como `NetworkError when attempting to fetch resource.`: as duas precisam virar a mensagem amigável (teste na Tarefa 1).
2. A nova tentativa automática de carregamento não pode se acumular nem continuar depois de sair da tela: depois que a conexão volta, `available_offices` para de ser chamada a cada 5 s (teste na Tarefa 2).
3. A limpeza do erro de carregamento não pode apagar uma mensagem de ação, como "Atendimento encerrado." (teste na Tarefa 2).
4. Sem internet, a verificação de senhas pendentes falha. Isso não pode impedir a troca de consultório, que segue sem perguntar (teste na Tarefa 5).
5. Modo "atuar como médico" (`delegated`) usa os mesmos caminhos de `start()`/`load()`: as mudanças não podem depender de `profile.id` em vez de `officeOwner`. Revisar no diff, sem teste próprio.

---

### Tarefa 1: Mensagens de erro em português

**Files:**
- Create: `src/utils/errors.js`
- Modify: `src/components/ui.jsx:22`
- Test: `test_logic.mjs` (novo grupo antes do `console.log` final)

**Interfaces:**
- Produces: `isNetworkError(e: unknown): boolean`, `friendlyError(e: unknown): string`, constantes `NETWORK_ERROR_MSG` e `DUPLICATE_CALL_MSG`. `err` em `ui.jsx` passa a ser `friendlyError`.

- [ ] **Step 1: Instalar dependências se faltarem**

Run: `ls node_modules >/dev/null 2>&1 || npm ci`
Expected: termina sem erro.

- [ ] **Step 2: Escrever o teste que falha**

Em `test_logic.mjs`, importar `{ friendlyError, isNetworkError, NETWORK_ERROR_MSG, DUPLICATE_CALL_MSG } from './src/utils/errors.js'` e adicionar:

```js
await test('erros de rede e de chamada duplicada viram mensagens em português', () => {
  assert.equal(NETWORK_ERROR_MSG, 'Sem internet neste aparelho. Verifique o Wi-Fi ou os dados móveis e tente de novo.');
  assert.equal(DUPLICATE_CALL_MSG, 'Esta senha acabou de ser chamada. Aguarde alguns segundos para chamar de novo.');
  // supabase-js devolve { message: 'TypeError: Failed to fetch' } quando o fetch cai
  for (const m of ['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed']) {
    assert.equal(isNetworkError({ message: m }), true, m);
    assert.equal(friendlyError({ message: m }), NETWORK_ERROR_MSG, m);
  }
  assert.equal(friendlyError(new TypeError('Failed to fetch')), NETWORK_ERROR_MSG);
  assert.equal(friendlyError({ code: '23505', message: 'Chamada duplicada bloqueada' }), DUPLICATE_CALL_MSG);
  assert.equal(friendlyError({ message: 'Somente o médico do consultório pode chamar' }), 'Somente o médico do consultório pode chamar');
  assert.equal(friendlyError(null), 'Não foi possível concluir a operação.');
  assert.equal(isNetworkError({ message: 'Senha não encontrada' }), false);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node test_logic.mjs`
Expected: FAIL (`Cannot find module .../src/utils/errors.js`).

- [ ] **Step 4: Implementar `src/utils/errors.js`**

`isNetworkError` testa `/Failed to fetch|Load failed|NetworkError|Network request failed/i` contra `e?.message` (um `TypeError` com essa mensagem também conta). `friendlyError` devolve, nesta ordem: `NETWORK_ERROR_MSG` se for rede; `DUPLICATE_CALL_MSG` se a mensagem contiver `Chamada duplicada bloqueada`; senão `e?.message || 'Não foi possível concluir a operação.'`. Em `ui.jsx:22`: `export { friendlyError as err } from '../utils/errors.js';`, removendo a definição antiga.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run check`
Expected: `Logic tests: OK (...)`, lint sem erros, build ok.

- [ ] **Step 6: Commit**

```bash
git add src/utils/errors.js src/components/ui.jsx test_logic.mjs
git commit -m "Erros: queda de internet e chamada duplicada em português"
```

---

### Tarefa 2: Erro de carregamento some sozinho quando a internet volta (A)

**Files:**
- Modify: `src/components/Doctor.jsx:14-58` (estado, `load`, efeito de montagem), bloco de mensagens em `:357-361`
- Modify: `tests/e2e/support/mocks.js` (novo helper)
- Create: `tests/e2e/doctor-resilience.spec.js`

**Interfaces:**
- Consumes: `err` (Tarefa 1), `NETWORK_ERROR_MSG` (Tarefa 1).
- Produces: `failRpc(page, name, times = 1): Promise<() => number>` em `mocks.js`. Registra uma rota **depois** de `mockSupabase` que faz `route.abort('failed')` nas primeiras `times` chamadas de `/rest/v1/rpc/<name>` e `route.fallback()` nas demais. Devolve uma função que diz quantas chamadas passaram pela rota. Também `doctorMocks(state)` e `openDoctor(page, state)` dentro do spec novo. `state` tem `{ current: 'o2', offices: [{id:'o1',name:'Consultório 1'},{id:'o2',name:'Consultório 2'}], tickets: { o1: [], o2: [] } }`. `start_doctor_session` muda `state.current`, `get_my_doctor_session` devolve `[{ session_id:'s', doctor_id:'d1', office_id: state.current, office_name }]` e `office_ticket_office_queue` devolve `state.tickets[p_office_id]`. O perfil (`role: 'doctor'`) e o `baseAuth` são copiados de `screens.spec.js:3-15`, e o `localStorage` é semeado com `cmip_doctor_office_user-1 = state.current`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/e2e/doctor-resilience.spec.js`

```js
test('médico: erro de rede no carregamento some sozinho quando a conexão volta', async ({ page }) => {
  const count = await openDoctor(page, state(), { failAvailableOffices: 1 }); // usa failRpc
  await expect(page.getByText(NETWORK_ERROR_MSG)).toBeVisible();
  await expect(page.getByText(NETWORK_ERROR_MSG)).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByText('TypeError')).toHaveCount(0);
  const after = count();
  await page.waitForTimeout(6000);
  expect(count()).toBe(after); // sem nova tentativa depois de recuperar
});

test('médico: mensagem de ação não é apagada pelo recarregamento', async ({ page }) => {
  await openDoctor(page, state());
  await page.getByRole('button', { name: 'Encerrar' }).click();
  await expect(page.getByText('Atendimento encerrado.')).toBeVisible();
});
```

(`end_doctor_session` no mock zera `state.current`, e `get_my_doctor_session` devolve `[]` quando `current` é vazio.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/doctor-resilience.spec.js`
Expected: o primeiro teste FAIL (a mensagem continua visível após 8 s); o segundo passa.

- [ ] **Step 3: Implementar em `Doctor.jsx`**

Novo estado `loadError` (string) e `retryTimer = useRef(null)`. Em `load()`: no início `clearTimeout(retryTimer.current)`; no sucesso (resposta mais nova) `setLoadError('')`; no `catch` (resposta mais nova) `setLoadError(err(e))` e `retryTimer.current = setTimeout(load, 5000)`. `load` deixa de escrever em `msg`. O efeito de desmontagem já existente também faz `clearTimeout(retryTimer.current)`. Renderizar `loadError` num `<p className="mt-4 text-amber-300" role="status">` próprio, logo acima do de `msg`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx playwright test tests/e2e/doctor-resilience.spec.js tests/e2e/screens.spec.js && npm run check`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Doctor.jsx tests/e2e/support/mocks.js tests/e2e/doctor-resilience.spec.js
git commit -m "Médico: erro de carregamento some sozinho quando a internet volta"
```

---

### Tarefa 3: Seleção volta ao consultório real quando a troca falha (D)

**Files:**
- Modify: `src/components/Doctor.jsx:114-140` (`start`, bloco `catch`)
- Test: `tests/e2e/doctor-resilience.spec.js`

**Interfaces:**
- Consumes: `failRpc`, `openDoctor`, `state` (Tarefa 2).

- [ ] **Step 1: Escrever o teste que falha**

```js
test('médico: troca de consultório sem internet mantém o consultório atual selecionado', async ({ page }) => {
  await openDoctor(page, state()); // current o2
  await failRpc(page, 'start_doctor_session', 1);
  await page.getByRole('button', { name: 'Trocar consultório' }).click();
  await page.getByLabel('Consultório').selectOption('o1');
  await expect(page.getByText(`Não foi possível iniciar o atendimento neste consultório. ${NETWORK_ERROR_MSG}`)).toBeVisible();
  await expect(page.getByLabel('Consultório')).toHaveValue('o2');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/doctor-resilience.spec.js -g "mantém o consultório"`
Expected: FAIL (valor `o1`).

- [ ] **Step 3: Implementar**

No `catch` de `start`: `setPendingOffice(previousOffice || '')`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx playwright test tests/e2e/doctor-resilience.spec.js && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Doctor.jsx tests/e2e/doctor-resilience.spec.js
git commit -m "Médico: seleção volta ao consultório atual quando a troca falha"
```

---

### Tarefa 4: Mensagem de um consultório não aparece em outro (B)

**Files:**
- Modify: `src/components/OfficeTicketList.jsx:25-27`
- Test: `tests/e2e/doctor-resilience.spec.js`

**Interfaces:**
- Consumes: `openDoctor`, `state` (Tarefa 2), `DUPLICATE_CALL_MSG` (Tarefa 1).

- [ ] **Step 1: Escrever o teste que falha**

O mock de `office_ticket_action` devolve `{ status: 409, body: { code: '23505', message: 'Chamada duplicada bloqueada' } }`. `state.tickets.o2 = [{ id:'q1', ticket_number: 412, display_number:'0412', patient_name:'REGINA HELENA', status:'called' }]`. O teste aceita qualquer diálogo desde o início (`page.on('dialog', d => d.accept())`), porque a Tarefa 5 vai perguntar antes da troca.

```js
test('médico: mensagem da lista de senhas não passa para o novo consultório', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await openDoctor(page, s, { duplicateCall: true });
  const list = page.getByLabel('Senhas do consultório');
  await list.getByRole('button', { name: /Rechamar/ }).click();
  await expect(list.getByText(DUPLICATE_CALL_MSG)).toBeVisible();
  await page.getByRole('button', { name: 'Trocar consultório' }).click();
  await page.getByLabel('Consultório').selectOption('o1');
  await expect(page.getByText('Senhas encaminhadas a Consultório 1')).toBeVisible();
  await expect(page.getByText(DUPLICATE_CALL_MSG)).toHaveCount(0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/doctor-resilience.spec.js -g "não passa para o novo"`
Expected: FAIL (a mensagem continua visível).

- [ ] **Step 3: Implementar**

No `useEffect` de `[officeId]`, junto do `setItems([])`: `setMsg('')`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx playwright test tests/e2e/doctor-resilience.spec.js && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/OfficeTicketList.jsx tests/e2e/doctor-resilience.spec.js
git commit -m "Médico: mensagem da caixa de senhas é zerada ao trocar de consultório"
```

---

### Tarefa 5: Avisar antes de deixar senha pendente ao trocar de consultório (E)

**Files:**
- Modify: `src/utils/officeTicketCall.js` (nova função exportada)
- Modify: `src/components/Doctor.jsx` (`start`, antes de chamar `startSession`)
- Test: `test_logic.mjs`, `tests/e2e/doctor-resilience.spec.js`

**Interfaces:**
- Consumes: `ticketLabel` (já existe em `officeTicketCall.js`), `cmipApi.officeTicketOfficeQueue(officeId)`.
- Produces: `pendingTicketsWarning(items: Array<{status, display_number?, patient_name?}>, officeName: string): string`. Devolve `''` quando nenhum item está `waiting` ou `called`.

- [ ] **Step 1: Escrever o teste de lógica que falha**

```js
await test('aviso de senhas pendentes ao trocar de consultório', () => {
  assert.equal(pendingTicketsWarning([], 'Consultório 2'), '');
  assert.equal(pendingTicketsWarning([{ status: 'finished', display_number: '0001' }], 'Consultório 2'), '');
  assert.equal(
    pendingTicketsWarning([{ status: 'called', display_number: '0412' }], 'Consultório 2'),
    'Senha 0412 ainda está no Consultório 2 sem confirmação. Trocar de consultório mesmo assim?'
  );
  assert.equal(
    pendingTicketsWarning([{ status: 'called', display_number: '0412' }, { status: 'waiting', patient_name: 'ANA' }], 'Consultório 2'),
    'Senha 0412, ANA ainda estão no Consultório 2 sem confirmação. Trocar de consultório mesmo assim?'
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node test_logic.mjs`
Expected: FAIL (`pendingTicketsWarning` não exportada).

- [ ] **Step 3: Implementar `pendingTicketsWarning`** em `officeTicketCall.js`, juntando `ticketLabel` com `', '` e usando "está"/"estão" conforme a quantidade.

- [ ] **Step 4: Escrever os testes E2E que falham**

```js
test('médico: recusar o aviso de senha pendente mantém o consultório', async ({ page }) => {
  // state.tickets.o2 com a senha 0412 'called'; mock conta chamadas a start_doctor_session
  page.once('dialog', (d) => { expect(d.message()).toContain('Senha 0412 ainda está no Consultório 2'); d.dismiss(); });
  // trocar para o1 → start_doctor_session não chamado; select volta a 'o2'
});

test('médico: sem internet, a verificação de pendentes não impede a troca', async ({ page }) => {
  // failRpc(page, 'office_ticket_office_queue', 99) só depois da tela aberta; nenhum diálogo; troca para o1 conclui
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `npx playwright test tests/e2e/doctor-resilience.spec.js -g "pendente"`
Expected: o primeiro FAIL (nenhum diálogo aparece).

- [ ] **Step 6: Implementar em `start()`**

Dentro do `try`, antes de iniciar a sessão nova e só quando `previousOffice && previousOffice !== officeId`, buscar `cmipApi.officeTicketOfficeQueue(previousOffice)` num `try/catch` próprio (falha → segue sem aviso, com `console.warn`). Se `pendingTicketsWarning(lista, session.office_name)` não for vazio e `window.confirm(...)` for recusado: `setPendingOffice(previousOffice)` e `return` (o `finally` libera `busy`).

- [ ] **Step 7: Rodar tudo**

Run: `npm run check && npx playwright test`
Expected: tudo PASS, incluindo a Tarefa 4 (que aceita o diálogo).

- [ ] **Step 8: Commit e push**

```bash
git add src/utils/officeTicketCall.js src/components/Doctor.jsx test_logic.mjs tests/e2e/doctor-resilience.spec.js
git commit -m "Médico: avisa antes de trocar de consultório com senha pendente"
git push -u origin claude/adoring-dirac-21a03n
```

---

## Fora do código (orientação à clínica)

- Celular da médica no Wi-Fi da clínica: em ligação, muitos aparelhos e operadoras cortam os dados móveis.
- Recepção encaminha a senha ao consultório em que a médica está.
- Confirmar ou cancelar a senha 0412 que ficou no Consultório 2.
