import { test, expect } from '@playwright/test';
import { mockSupabase, seedSession, failRpc } from './support/mocks.js';
import { NETWORK_ERROR_MSG, DUPLICATE_CALL_MSG } from '../../src/utils/errors.js';

// Tela do médico com internet instável (prints de 04/11/2026): Supabase simulado.
const profile = {
  id: 'user-1',
  full_name: 'Médico',
  username: 'medico',
  display_name: null,
  role: 'doctor',
  active: true,
  must_change_password: false,
};
const baseAuth = { 'GET /user': () => ({ id: 'user-1', email: 'e2e@example.com' }), 'POST /logout': () => ({}) };

const state = () => ({
  current: 'o2',
  offices: [
    { id: 'o1', name: 'Consultório 1' },
    { id: 'o2', name: 'Consultório 2' },
  ],
  tickets: { o1: [], o2: [] },
  startCalls: 0,
});

const officeName = (s, id) => s.offices.find((o) => o.id === id)?.name || '';

function doctorMocks(s, opts = {}) {
  return {
    auth: baseAuth,
    rest: { profiles: () => profile },
    rpc: {
      available_offices: () => s.offices,
      get_my_doctor_session: () =>
        s.current
          ? [{ session_id: `s-${s.current}`, doctor_id: 'd1', office_id: s.current, office_name: officeName(s, s.current) }]
          : [],
      start_doctor_session: (p) => {
        s.startCalls += 1;
        s.current = p.p_office_id;
        return null;
      },
      end_doctor_session: (p) => {
        if (s.current === p.p_office_id) s.current = '';
        return null;
      },
      doctor_heartbeat: () => null,
      office_ticket_office_queue: (p) => s.tickets[p.p_office_id] || [],
      office_ticket_action: () =>
        opts.duplicateCall ? { status: 409, body: { code: '23505', message: 'Chamada duplicada bloqueada' } } : null,
      list_active_display_panels: () => [],
    },
  };
}

/** Abre a tela do médico já com o consultório `s.current` salvo neste aparelho. */
async function openDoctor(page, s, opts = {}) {
  await seedSession(page);
  await page.addInitScript((office) => localStorage.setItem('cmip_doctor_office_user-1', office), s.current);
  await mockSupabase(page, doctorMocks(s, opts));
  const count = opts.failAvailableOffices ? await failRpc(page, 'available_offices', opts.failAvailableOffices) : null;
  await page.goto('/');
  return count;
}

test('médico: erro de rede no carregamento some sozinho quando a conexão volta', async ({ page }) => {
  const count = await openDoctor(page, state(), { failAvailableOffices: 1 });
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

test('médico: troca de consultório sem internet mantém o consultório atual selecionado', async ({ page }) => {
  await openDoctor(page, state()); // current o2
  await expect(page.getByText('Online • Consultório 2')).toBeVisible();
  // Internet caída de verdade: a troca e os recarregamentos (Realtime/nova tentativa) falham juntos.
  await failRpc(page, 'start_doctor_session', 1);
  await failRpc(page, 'available_offices', 99);
  await page.getByRole('button', { name: 'Trocar consultório' }).click();
  await page.getByLabel('Consultório', { exact: true }).selectOption('o1');
  await expect(
    page.getByText(`Não foi possível iniciar o atendimento neste consultório. ${NETWORK_ERROR_MSG}`)
  ).toBeVisible();
  await expect(page.getByLabel('Consultório', { exact: true })).toHaveValue('o2');
});

test('médico: mensagem da lista de senhas não passa para o novo consultório', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const s = state();
  s.tickets.o2 = [{ id: 'q1', ticket_number: 412, display_number: '0412', patient_name: 'REGINA HELENA', status: 'called' }];
  await openDoctor(page, s, { duplicateCall: true });
  const list = page.getByLabel('Senhas do consultório');
  await list.getByRole('button', { name: /Rechamar/ }).click();
  await expect(list.getByText(DUPLICATE_CALL_MSG)).toBeVisible();
  await page.getByRole('button', { name: 'Trocar consultório' }).click();
  await page.getByLabel('Consultório', { exact: true }).selectOption('o1');
  await expect(page.getByText('Senhas encaminhadas a Consultório 1')).toBeVisible();
  await expect(page.getByText(DUPLICATE_CALL_MSG)).toHaveCount(0);
});

test('médico: recusar o aviso de senha pendente mantém o consultório', async ({ page }) => {
  const s = state();
  s.tickets.o2 = [{ id: 'q1', ticket_number: 412, display_number: '0412', patient_name: 'REGINA HELENA', status: 'called' }];
  await openDoctor(page, s);
  await expect(page.getByText('Online • Consultório 2')).toBeVisible();
  let dialog = '';
  page.once('dialog', (d) => {
    dialog = d.message();
    d.dismiss();
  });
  await page.getByRole('button', { name: 'Trocar consultório' }).click();
  const select = page.getByLabel('Consultório', { exact: true });
  await select.selectOption('o1');
  await expect.poll(() => dialog).toContain('Senha 0412 ainda está no Consultório 2');
  await expect(select).toHaveValue('o2');
  expect(s.startCalls).toBe(0);
  expect(s.current).toBe('o2');
});

test('médico: sem internet, a verificação de pendentes não impede a troca', async ({ page }) => {
  const s = state();
  s.tickets.o2 = [{ id: 'q1', ticket_number: 412, display_number: '0412', patient_name: 'REGINA HELENA', status: 'called' }];
  await openDoctor(page, s);
  await expect(page.getByText('Online • Consultório 2')).toBeVisible();
  await failRpc(page, 'office_ticket_office_queue', 99);
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs += 1;
    d.accept();
  });
  await page.getByRole('button', { name: 'Trocar consultório' }).click();
  await page.getByLabel('Consultório', { exact: true }).selectOption('o1');
  await expect(page.getByText('Online • Consultório 1')).toBeVisible();
  expect(s.current).toBe('o1');
  expect(dialogs).toBe(0);
});
