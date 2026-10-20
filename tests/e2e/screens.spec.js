import { test, expect } from '@playwright/test';
import { mockSupabase, seedSession } from './support/mocks.js';

const profile = (over = {}) => ({
  id: 'user-1',
  full_name: 'Fulano de Tal',
  username: 'fulano',
  display_name: null,
  role: 'receptionist',
  active: true,
  must_change_password: false,
  ...over,
});

const baseAuth = { 'GET /user': () => ({ id: 'user-1', email: 'e2e@example.com' }), 'POST /logout': () => ({}) };

test('perfil sem módulos mostra tela com botão de sair (antes ficava preso)', async ({ page }) => {
  await seedSession(page);
  await mockSupabase(page, {
    auth: baseAuth,
    rest: { profiles: () => profile({ role: 'visitante' }) },
    rpc: { list_active_display_panels: () => [] },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acesso não autorizado' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao login' }).click();
  await expect(page.getByPlaceholder('Usuário')).toBeVisible();
});

test('troca de senha exige o mesmo mínimo do cadastro (10 caracteres)', async ({ page }) => {
  await seedSession(page);
  await mockSupabase(page, {
    auth: baseAuth,
    rest: { profiles: () => profile({ must_change_password: true }) },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Primeiro acesso' })).toBeVisible();
  await page.getByPlaceholder('Nova senha', { exact: true }).fill('123456789');
  await page.getByPlaceholder('Confirmar nova senha').fill('123456789');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByText('pelo menos 10 caracteres')).toBeVisible();
});

test('primeiro acesso: se a confirmação falhar, tentar de novo não repete a troca de senha', async ({ page }) => {
  await seedSession(page);
  let mustChange = true;
  let completeCalls = 0;
  const calls = await mockSupabase(page, {
    auth: { ...baseAuth, 'PUT /user': () => ({ id: 'user-1' }) },
    rest: { profiles: () => profile({ role: 'visitante', must_change_password: mustChange }) },
    rpc: {
      complete_first_password_change: () => {
        completeCalls += 1;
        if (completeCalls === 1) return { status: 500, body: { message: 'falha temporária' } };
        mustChange = false;
        return null;
      },
    },
  });
  await page.goto('/');
  await page.getByPlaceholder('Nova senha', { exact: true }).fill('SenhaNova#2026');
  await page.getByPlaceholder('Confirmar nova senha').fill('SenhaNova#2026');
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByText('falha temporária')).toBeVisible();
  await page.getByRole('button', { name: 'Alterar senha' }).click();
  await expect(page.getByRole('heading', { name: 'Acesso não autorizado' })).toBeVisible();
  const passwordUpdates = calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/auth/v1/user'));
  expect(passwordUpdates).toHaveLength(1);
});

const receptionMocks = (extra = {}) => ({
  auth: baseAuth,
  rest: {
    profiles: () => profile(),
    service_points: () => [{ id: 'sp1', name: 'Guichê 1', active: true }],
    display_panel_service_points: () => [{ display_panel_id: 'p1', display_panels: { code: 'recepcao', active: true } }],
    reception_queue_view: () => [],
  },
  rpc: {
    get_global_ticket_counter_state: () => ({ current_number: 5, next_number: 6, display_next: '0006' }),
    // a última chamada do painel foi MÉDICA: antes o botão RECHAMAR ficava desabilitado
    get_display_state: () => ({
      current: { kind: 'medical', patient_name: 'Maria Souza', event_key: 'm1' },
      history: [],
    }),
    list_available_doctors: () => [],
    office_ticket_queues: () => [],
    ...extra,
  },
});

test('recepção: RECHAMAR continua disponível quando a última chamada do painel foi médica', async ({ page }) => {
  await seedSession(page);
  await mockSupabase(page, receptionMocks());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chamar Próximo Paciente' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'RECHAMAR' })).toBeEnabled();
});

test('recepção: a próxima senha acompanha sozinha quando outro computador chama', async ({ page }) => {
  await seedSession(page);
  let counter = { current_number: 5, next_number: 6, display_next: '0006' };
  await mockSupabase(page, receptionMocks({ get_global_ticket_counter_state: () => counter }));
  await page.goto('/');
  await expect(page.getByText('0006', { exact: true })).toBeVisible();
  counter = { current_number: 41, next_number: 42, display_next: '0042' };
  await expect(page.getByText('0042', { exact: true })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText('41 / 1000')).toBeVisible();
});

test('recepção: CHAMAR PRÓXIMA usa a sequência única da clínica', async ({ page }) => {
  await seedSession(page);
  const calls = [];
  await mockSupabase(
    page,
    receptionMocks({
      call_next_global_ticket: (b) => (calls.push(['global', b]), { id: 't6', display_number: '0006' }),
      call_next_ticket: (b) => (calls.push(['guiche', b]), { id: 't6', display_number: '0006' }),
    })
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'CHAMAR PRÓXIMA' }).click();
  await expect(page.getByText('Senha 0006 chamada')).toBeVisible();
  expect(calls).toEqual([['global', { p_service_point_id: 'sp1' }]]);
});

test('recepção: sem a migration da sequência única, continua no contador do guichê', async ({ page }) => {
  await seedSession(page);
  const missing = () => ({ status: 404, body: { code: 'PGRST202', message: 'Could not find the function' } });
  const calls = [];
  await mockSupabase(
    page,
    receptionMocks({
      get_global_ticket_counter_state: missing,
      call_next_global_ticket: missing,
      get_ticket_counter_state: () => ({ current_number: 8, next_number: 9, display_next: '0009' }),
      call_next_ticket: (b) => (calls.push(b), { id: 't9', display_number: '0009' }),
    })
  );
  await page.goto('/');
  await expect(page.getByText('0009', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'CHAMAR PRÓXIMA' }).click();
  await expect(page.getByText('Senha 0009 chamada')).toBeVisible();
  expect(calls).toEqual([{ p_service_point_id: 'sp1' }]);
});

test('recepção: erro ao carregar guichês aparece como mensagem, não como lista vazia', async ({ page }) => {
  await seedSession(page);
  const mocks = receptionMocks();
  mocks.rest.service_points = () => ({ status: 403, body: { message: 'permission denied for table service_points' } });
  await mockSupabase(page, mocks);
  await page.goto('/');
  await expect(page.getByText(/permission denied/)).toBeVisible();
});

test('recepção: CPF inválido é bloqueado no cadastro', async ({ page }) => {
  await seedSession(page);
  await mockSupabase(page, receptionMocks());
  await page.goto('/');
  await page.getByRole('button', { name: '+ Cadastrar paciente' }).click();
  await page.getByPlaceholder('Nome completo *').fill('Paciente E2E');
  await page.locator('input[type=date]').fill('1990-01-01');
  await page.getByPlaceholder('CPF', { exact: true }).fill('11111111111');
  await page.getByRole('button', { name: 'Salvar paciente' }).click();
  await expect(page.getByText('CPF inválido.')).toBeVisible();
});

test('recepção: transferência não pode ser disparada duas vezes', async ({ page }) => {
  await seedSession(page);
  let transfers = 0;
  const mocks = receptionMocks({
    list_available_doctors: () => [
      { doctor_id: 'd1', doctor_name: 'Dr. A', office_name: 'Sala 1' },
      { doctor_id: 'd2', doctor_name: 'Dr. B', office_name: 'Sala 2' },
    ],
    transfer_patient: async () => {
      transfers += 1;
      await new Promise((r) => setTimeout(r, 600));
      return null;
    },
  });
  mocks.rest.reception_queue_view = () => [
    { id: 'q1', patient_name: 'Maria Souza', doctor_id: 'd1', doctor_name: 'Dr. A', status: 'waiting' },
  ];
  await mockSupabase(page, mocks);
  await page.goto('/');
  const target = page.locator('select', { has: page.locator('option', { hasText: 'Novo médico' }) });
  await expect(target.locator('option', { hasText: 'Dr. B' })).toHaveCount(1);
  await target.selectOption('d2');
  const button = page.getByRole('button', { name: 'Transferir' });
  await button.click();
  await expect(button).toBeDisabled();
  await button.click({ force: true }).catch(() => {});
  await expect(page.getByText('transferido com sucesso')).toBeVisible();
  expect(transfers).toBe(1);
});

test('recepção: encaminha senha ao consultório sem médico logado e só pode trocar o consultório', async ({ page }) => {
  await seedSession(page);
  const queue = [];
  let enqueued, called, moved;
  const mocks = receptionMocks({
    office_ticket_queues: () => [
      { office_id: 'o1', office_name: 'Consultório 1', items: queue.filter((x) => x.office_id === 'o1') },
      { office_id: 'o10', office_name: 'Consultório 10', items: queue.filter((x) => x.office_id === 'o10') },
      { office_id: 'o2', office_name: 'Consultório 2', items: queue.filter((x) => x.office_id === 'o2') },
    ],
    office_ticket_enqueue: (b) => {
      enqueued = b;
      queue.push({ id: 'q1', office_id: b.p_office_id, display_number: '0045', status: 'waiting' });
      return { id: 'q1', display_number: '0045' };
    },
    office_ticket_action: (b) => {
      called = b;
      return null;
    },
    office_ticket_move: (b) => {
      moved = b;
      queue[0].office_id = b.p_office_id;
      return { id: 'q1', office_name: 'Consultório 2' };
    },
  });
  mocks.rest.display_panel_offices = () => [{ display_panel_id: 'p1', display_panels: { code: 'recepcao', active: true } }];
  await mockSupabase(page, mocks);
  await page.goto('/');
  await page.getByLabel('Número da senha').fill('45');
  await page.getByRole('button', { name: 'Encaminhar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Escolher consultório' });
  await expect(dialog.getByText('Encaminhar Senha 0045 para:')).toBeVisible();
  // ordem natural: 1, 2, 10 (e não 1, 10, 2)
  const names = await dialog.locator('b').allTextContents();
  expect(names.filter((n) => n.startsWith('Consultório'))).toEqual(['Consultório 1', 'Consultório 2', 'Consultório 10']);
  await dialog.getByRole('button', { name: /Consultório 1 / }).click();
  await expect(page.getByText('Senha 0045 encaminhada para Consultório 1.')).toBeVisible();
  expect(enqueued).toEqual({ p_office_id: 'o1', p_number: 45 });
  // A recepção não chama, não confirma e não cancela: só troca o consultório.
  const row = page.getByRole('listitem').filter({ hasText: 'Senha 0045' });
  await expect(row.getByRole('button', { name: /Chamar|Rechamar|Confirmar|Cancelar|Concluir|Remover/ })).toHaveCount(0);
  await row.getByLabel('Novo consultório da senha 0045').selectOption('o2');
  await row.getByRole('button', { name: 'Trocar', exact: true }).click();
  await expect(page.getByText('Senha 0045 trocada para Consultório 2.')).toBeVisible();
  expect(moved).toEqual({ p_queue_id: 'q1', p_office_id: 'o2' });
  expect(called).toBeUndefined();
});

test('médico: vê as senhas encaminhadas ao consultório e chama sem a recepção', async ({ page }) => {
  await seedSession(page);
  let called;
  await mockSupabase(page, {
    auth: baseAuth,
    rest: {
      profiles: () => profile({ role: 'doctor', full_name: 'Dr. Teste' }),
      doctor_queue_view: () => [],
      display_panel_offices: () => [{ display_panel_id: 'p1', display_panels: { code: 'recepcao', active: true } }],
    },
    rpc: {
      available_offices: () => [{ id: 'o4', name: 'Consultório 4' }],
      get_my_doctor_session: () => [{ session_id: 's1', doctor_id: 'd1', office_id: 'o4', office_name: 'Consultório 4' }],
      doctor_heartbeat: () => new Date().toISOString(),
      office_ticket_office_queue: () => [
        { id: 'q9', ticket_number: 244, display_number: '0244', status: 'waiting' },
      ],
      office_ticket_action: (b) => {
        called = b;
        return { event_key: 'o9', kind: 'ticket', display_number: '0244', destination: 'Consultório 4', is_recall: false };
      },
    },
  });
  await page.goto('/');
  const list = page.getByLabel('Senhas do consultório');
  await expect(list.getByText('Senha 0244')).toBeVisible();
  await list.getByRole('button', { name: /^Chamar/ }).click();
  await expect(page.getByText(/Senha 0244 (chamada para Consultório 4.|registrada)/)).toBeVisible();
  expect(called).toEqual({ p_queue_id: 'q9', p_action: 'call' });
  page.once('dialog', (d) => d.accept());
  await list.getByRole('button', { name: 'Cancelar senha 0244' }).click();
  await expect.poll(() => called).toEqual({ p_queue_id: 'q9', p_action: 'cancel' });
  await expect(list.getByRole('button', { name: 'Confirmar senha 0244' })).toBeVisible();
});

const adminMocks = (functions) => ({
  auth: baseAuth,
  rest: { profiles: () => profile({ role: 'admin', full_name: 'Admin Teste' }) },
  rpc: {
    admin_list_users: () => [
      { id: 'u2', full_name: 'Leandro Nogueira', username: 'leandro.nogueira', role: 'doctor', active: true, must_change_password: false },
    ],
    master_dashboard: () => ({}),
    master_list_resources: () => ({ offices: [], service_points: [], displays: [], display_offices: [], display_service_points: [], doctors: [] }),
  },
  functions,
});

test('admin: redefinir senha mostra a senha padrão definida', async ({ page }) => {
  await seedSession(page);
  let body;
  await mockSupabase(page, adminMocks({ 'master-user-admin': (b) => ((body = b), { ok: true }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Usuários' }).click();
  await page.getByRole('button', { name: 'Redefinir senha' }).first().click();
  await page.getByRole('button', { name: 'Confirmar redefinição' }).click();
  await expect(page.getByText(/Senha redefinida com sucesso/)).toBeVisible();
  await expect(page.getByText(/CMIP123456/)).toBeVisible();
  expect(body).toEqual({ action: 'reset_password', user_id: 'u2', temporary_password: 'CMIP123456' });
});

test('admin: cadastro valida o usuário e mostra o erro real do servidor', async ({ page }) => {
  await seedSession(page);
  let created;
  await mockSupabase(
    page,
    adminMocks({
      'master-user-admin': (b) => {
        created = b;
        return { status: 400, body: { error: 'Dados inválidos' } };
      },
    })
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Usuários' }).click();
  await page.getByRole('button', { name: '+ Novo usuário' }).click();
  await page.getByPlaceholder('Nome completo').fill('Dr João da Silva');
  await page.getByPlaceholder('Usuário de login (ex.: dr.joao)').fill('x');
  await page.getByPlaceholder('E-mail').fill('joao@example.com');
  await page.getByPlaceholder(/Senha temporária/).fill('SenhaTemp#2026');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Usuário inválido/)).toBeVisible();
  expect(created).toBeUndefined();

  await page.getByPlaceholder('Usuário de login (ex.: dr.joao)').fill('Dr. João');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Dados inválidos')).toBeVisible();
  expect(created.username).toBe('dr.joao');
});
