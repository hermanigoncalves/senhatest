import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://echypqclxnztvjicnkbf.supabase.co/**', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.endsWith('/rest/v1/rpc/list_active_display_panels')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ code: 'recepcao', name: 'TV Recepção' }]),
      });
    }
    if (url.endsWith('/rest/v1/rpc/get_public_display_state')) {
      const payload = request.postDataJSON();
      const state = payload?.p_panel_slug === 'recepcao'
        ? { panel: { code: 'recepcao', name: 'TV Recepção' }, current: null, history: [] }
        : null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
    }
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.routeWebSocket('wss://echypqclxnztvjicnkbf.supabase.co/**', (socket) => socket.close());
});

test('TV pública reproduz layout antigo e pode ser ativada', async ({ page }) => {
  await page.goto('/tv/recepcao', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('ATIVAR PAINEL')).toBeVisible();
  await expect(page.getByText('Últimas Chamadas')).toBeVisible();
  await expect(page.getByText('CMIP VÍDEOS INSTITUCIONAIS')).toBeVisible();
  await expect(page.locator('video')).toBeVisible();
  await expect(page.locator('video')).toHaveAttribute('src', /WhatsApp%20Video|WhatsApp Video/);
});

test('login público lista displays ativos dinamicamente', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Painéis de TV')).toBeVisible();
  await expect(page.getByRole('link', { name: 'TV Recepção' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'TV Recepção' })).toHaveAttribute('href', '/tv/recepcao');
});

test('TV inexistente não expõe painel', async ({ page }) => {
  await page.goto('/tv/display-inexistente', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('TV não encontrada ou inativa')).toBeVisible();
});
