import { test, expect } from '@playwright/test';

test('TV pública reproduz layout antigo e pode ser ativada', async ({ page }) => {
  await page.goto('/tv/recepcao');
  await expect(page.getByText('ATIVAR PAINEL')).toBeVisible();
  await expect(page.getByText('Últimas Chamadas')).toBeVisible();
  await expect(page.getByText('CMIP VÍDEOS INSTITUCIONAIS')).toBeVisible();
  await expect(page.locator('video')).toBeVisible();
});

test('login lista displays ativos como botões', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Painéis de TV')).toBeVisible();
  await expect(page.getByRole('link', { name: 'TV Recepção' })).toHaveAttribute('href', '/tv/recepcao');
});

test('TV inexistente não expõe painel', async ({ page }) => {
  await page.goto('/tv/display-inexistente');
  await expect(page.getByText('TV não encontrada ou inativa')).toBeVisible();
});
