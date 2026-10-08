import { test, expect } from '@playwright/test';
import { mockSupabase, stubMedia } from './support/mocks.js';

const PANEL = { code: 'recepcao', name: 'TV Recepção' };
const ticket = (n, key) => ({
  event_key: key,
  kind: 'ticket',
  display_number: n,
  destination: 'Guichê 1',
  at: new Date().toISOString(),
});
const medical = (key) => ({
  event_key: key,
  kind: 'medical',
  patient_name: 'Maria S.',
  destination: 'Sala 3',
  at: new Date().toISOString(),
});

// Estado da TV: o 1º retorno é o boot; a partir do 2º ciclo de polling (10s), devolve a nova chamada.
function panelSequence(boot, next) {
  const startedAt = { t: 0 };
  return () => {
    if (!startedAt.t) startedAt.t = Date.now();
    const current = Date.now() - startedAt.t > 4000 ? next : boot;
    return { panel: PANEL, current, history: [boot] };
  };
}

async function setup(page, publicState, { audio } = {}) {
  const ttsRequests = [];
  await stubMedia(page, { audio });
  await page.route('**/api/tts**', (route) => {
    ttsRequests.push(decodeURIComponent(new URL(route.request().url()).searchParams.get('text') || ''));
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([0xff, 0xfb, 0x90, 0x00]) });
  });
  await mockSupabase(page, {
    rpc: {
      list_active_display_panels: () => [PANEL],
      get_public_display_state: (payload) => (payload?.p_panel_slug === 'recepcao' ? publicState() : null),
    },
  });
  return ttsRequests;
}

test('TV pública mostra o layout, os vídeos e pode ser ativada', async ({ page }) => {
  await setup(page, () => ({ panel: PANEL, current: null, history: [] }));
  await page.goto('/tv/recepcao', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('ATIVAR PAINEL')).toBeVisible();
  await expect(page.getByText('Últimas Chamadas')).toBeVisible();
  await expect(page.getByText('CMIP VÍDEOS INSTITUCIONAIS')).toBeVisible();
  await expect(page.locator('video')).toHaveAttribute('src', '/institucional-1.mp4');
  await page.getByText('ATIVAR PAINEL').click();
  await expect(page.getByText('ATIVAR PAINEL')).toHaveCount(0);
});

test('qualquer tecla (controle remoto) ativa o painel', async ({ page }) => {
  await setup(page, () => ({ panel: PANEL, current: null, history: [] }));
  await page.goto('/tv/recepcao', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('ATIVAR PAINEL')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByText('ATIVAR PAINEL')).toHaveCount(0);
});

test('painel ativa sozinho quando o navegador já libera o áudio (ex.: quiosque)', async ({ page }) => {
  await setup(page, () => ({ panel: PANEL, current: null, history: [] }), { audio: 'running' });
  await page.goto('/tv/recepcao', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('ATIVAR PAINEL')).toHaveCount(0, { timeout: 5000 });
});

test('vídeo institucional volta a tocar depois de uma chamada de senha', async ({ page }) => {
  const state = panelSequence(ticket('0001', 't1'), ticket('0002', 't2'));
  await setup(page, state);
  await page.goto('/tv/recepcao', { waitUntil: 'domcontentloaded' });
  await page.getByText('ATIVAR PAINEL').click();
  await expect(page.getByText('0001').first()).toBeVisible();
  const baseline = await page.evaluate(() => window.__media.videoPlay);

  // Chega a nova chamada pelo polling de contingência (10s)
  await expect(page.getByText('0002').first()).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => window.__media.videoPause), { timeout: 10000 }).toBeGreaterThan(0);
  // Regressão: o vídeo era pausado na chamada e nunca retomava (callback com valor antigo de `activated`)
  await expect
    .poll(() => page.evaluate(() => window.__media.videoPlay), { timeout: 15000 })
    .toBeGreaterThan(baseline);
});

test('chamada médica mostra nome abreviado e nunca envia o nome ao TTS online', async ({ page }) => {
  const state = panelSequence(ticket('0001', 't1'), medical('m5'));
  const ttsRequests = await setup(page, state);
  await page.goto('/tv/recepcao', { waitUntil: 'domcontentloaded' });
  await page.getByText('ATIVAR PAINEL').click();
  await expect(page.getByText('CONSULTA MÉDICA')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Maria S.').first()).toBeVisible();
  // dá tempo para a fila de anúncio tentar falar
  await page.waitForTimeout(3500);
  expect(ttsRequests.filter((t) => /Maria|Paciente|Sala/i.test(t))).toEqual([]);
  // só o teste de disponibilidade ("1") e, no máximo, frases de senha podem sair
  for (const t of ttsRequests) expect(t === '1' || /^Senha \d+\./.test(t)).toBe(true);
});

test('falha na primeira consulta: TV fica OFFLINE mas os vídeos carregam', async ({ page }) => {
  await stubMedia(page);
  await mockSupabase(page, {
    rpc: {
      list_active_display_panels: () => [],
      get_public_display_state: () => ({ status: 500, body: { message: 'boom' } }),
    },
  });
  await page.goto('/tv/recepcao', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('OFFLINE')).toBeVisible();
  await expect(page.locator('video')).toHaveAttribute('src', '/institucional-1.mp4');
});

test('login público lista as TVs ativas dinamicamente', async ({ page }) => {
  await mockSupabase(page, { rpc: { list_active_display_panels: () => [PANEL] } });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Painéis de TV')).toBeVisible();
  await expect(page.getByRole('link', { name: 'TV Recepção' })).toHaveAttribute('href', '/tv/recepcao');
});

test('TV inexistente mostra aviso', async ({ page }) => {
  await mockSupabase(page, { rpc: { get_public_display_state: () => null } });
  await page.goto('/tv/display-inexistente', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('TV não encontrada ou inativa')).toBeVisible();
});

test('/tvqualquercoisa não abre a TV (cai no login)', async ({ page }) => {
  await mockSupabase(page, { rpc: { list_active_display_panels: () => [] } });
  await page.goto('/tvqualquercoisa', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'CMIP CHAMADOR' })).toBeVisible();
});
