import { test, expect } from '@playwright/test';

// Configurações do ambiente de teste real
const REAL_ENABLED = process.env.E2E_REAL === '1';
const LEANDRO_USERNAME = process.env.E2E_REAL_USERNAME;
const LEANDRO_UUID = process.env.E2E_REAL_USER_UUID;
const INITIAL_TEMP_PASSWORD = process.env.E2E_REAL_TEMP_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const masterEmail = process.env.E2E_MASTER_EMAIL;
const masterPassword = process.env.E2E_MASTER_PASSWORD;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const hasSuperuser = Boolean((masterEmail && masterPassword) || (adminEmail && adminPassword));

test.describe('Fluxo Real de Autenticação CMIP (Sem Mocks)', () => {
  test.skip(
    !REAL_ENABLED || !LEANDRO_USERNAME || !LEANDRO_UUID || !INITIAL_TEMP_PASSWORD || !SUPABASE_URL || !PUBLISHABLE_KEY,
    'E2E real desabilitado. Use E2E_REAL=1 e credenciais/URLs apenas por variáveis de ambiente.'
  );

  test.afterEach(async ({ request }) => {
    // Restaura o usuário de teste: senha temporária + must_change_password=true (exige credenciais de Admin/Master).
    if (!hasSuperuser) {
      console.warn('Teardown ignorado: defina E2E_ADMIN_* ou E2E_MASTER_* para restaurar o usuário de teste.');
      return;
    }
    try {
      const login = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE_KEY },
        data: { email: masterEmail || adminEmail, password: masterPassword || adminPassword },
      });
      const { access_token: token } = await login.json();
      await request.post(`${SUPABASE_URL}/functions/v1/master-user-admin`, {
        headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        data: { action: 'reset_password', user_id: LEANDRO_UUID, temporary_password: INITIAL_TEMP_PASSWORD },
      });
    } catch (e) {
      console.warn('Teardown reset falhou:', e.message);
    }
  });

  test('11.A - username correto com senha errada exibe erro amigável', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Usuário')).toBeVisible();
    await page.screenshot({ path: 'evidences/01-login-screen.png' });

    await page.getByPlaceholder('Usuário').fill(LEANDRO_USERNAME);
    await page.getByPlaceholder('Senha').fill('SenhaTotalmenteIncorreta!999');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('functions/v1/username-login')),
      page.getByRole('button', { name: 'Entrar' }).click()
    ]);

    expect(response.status()).toBe(401);
    await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible();
    await page.screenshot({ path: 'evidences/06-error-invalid-credentials.png' });
  });

  test('11.B - username inexistente exibe erro amigável sem revelar se o usuário existe', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Usuário').fill('usuario.inexistente.cmip');
    await page.getByPlaceholder('Senha').fill('QualquerSenha123!');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('functions/v1/username-login')),
      page.getByRole('button', { name: 'Entrar' }).click()
    ]);

    expect(response.status()).toBe(401);
    await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible();
    await page.screenshot({ path: 'evidences/07-error-nonexistent-user.png' });
  });

  test('Fluxo completo Leandro Nogueira: Login -> must_change_password -> Troca de Senha -> Acesso Médico -> Reload -> Logout', async ({ page }) => {
    const uniquePassword = 'CmipTestPass_' + Date.now() + '!#9z';

    // 1. Abrir aplicação
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Usuário')).toBeVisible();

    // 2. Preencher usuário e senha temporária
    await page.getByPlaceholder('Usuário').fill(LEANDRO_USERNAME);
    await page.getByPlaceholder('Senha').fill(INITIAL_TEMP_PASSWORD);

    // 3. Enviar e monitorar resposta real de username-login
    const [loginResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('functions/v1/username-login')),
      page.getByRole('button', { name: 'Entrar' }).click()
    ]);

    expect(loginResponse.status()).toBe(200);
    const loginData = await loginResponse.json();

    expect(loginData.success).toBe(true);
    expect(loginData.session).toBeDefined();
    expect(loginData.session.access_token).toBeTruthy();
    expect(loginData.session.refresh_token).toBeTruthy();
    expect(loginData.user.id).toBe(LEANDRO_UUID);
    expect(loginData.profile.username).toBe(LEANDRO_USERNAME);
    expect(loginData.profile.must_change_password).toBe(true);

    // Validar que nenhum e-mail interno é exibido no frontend
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toContain('@');
    expect(pageText).not.toContain('IdentityBackendUnavailableError');

    // 4. Validar tela de troca obrigatória (must_change_password = true)
    await expect(page.getByRole('heading', { name: 'Primeiro acesso' })).toBeVisible();
    await expect(page.getByText('defina sua senha definitiva antes de continuar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Minha fila' })).toHaveCount(0);
    await expect(page.getByText('Pacientes')).toHaveCount(0);
    await page.screenshot({ path: 'evidences/02-must-change-password-screen.png' });

    // 5. Preencher nova senha válida e submeter
    await page.getByPlaceholder('Nova senha', { exact: true }).fill(uniquePassword);
    await page.getByPlaceholder('Confirmar nova senha').fill(uniquePassword);

    const [userUpdateRes, completeRpcRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/auth/v1/user') && res.request().method() === 'PUT'),
      page.waitForResponse(res => res.url().includes('complete_first_password_change') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Alterar senha' }).click()
    ]);

    expect(userUpdateRes.status()).toBe(200);
    expect([200, 204]).toContain(completeRpcRes.status());

    // 6. Validar transição para módulo médico
    await expect(page.getByRole('heading', { name: 'Minha fila' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Leandro Nogueira/i)).toBeVisible();
    await expect(page.getByText('doctor', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atuar como médico' })).toHaveCount(0);
    await page.screenshot({ path: 'evidences/03-doctor-workspace-screen.png' });

    // 7. Validar recarga (F5) e persistência de sessão
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Minha fila' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Leandro Nogueira/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Primeiro acesso' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Usuário')).toHaveCount(0);
    await page.screenshot({ path: 'evidences/04-doctor-after-reload.png' });

    // 8. Validar na UI que Doctor não tem botão de redefinição de senha nem painel admin
    await expect(page.getByRole('button', { name: 'Redefinir senha' })).toHaveCount(0);
    await expect(page.getByText('Administração')).toHaveCount(0);

    // 9. Executar logout
    await page.getByRole('button', { name: /Sair/i }).click();
    await expect(page.getByPlaceholder('Usuário')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Minha fila' })).toHaveCount(0);

    // Validar storage limpo
    const storedAuthTokens = await page.evaluate(() => {
      return Object.keys(localStorage).filter(k => k.includes('auth-token') && localStorage.getItem(k)?.includes('access_token'));
    });
    expect(storedAuthTokens.length).toBe(0);
    await page.screenshot({ path: 'evidences/05-logout-screen.png' });
  });

  test('11.D - Doctor tentando acessar reset administrativo: UI bloqueada e verificação de Backend', async ({ page }) => {
    // 1. Login com Leandro
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Usuário').fill(LEANDRO_USERNAME);
    await page.getByPlaceholder('Senha').fill(INITIAL_TEMP_PASSWORD);
    const [loginRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('functions/v1/username-login')),
      page.getByRole('button', { name: 'Entrar' }).click()
    ]);
    expect(loginRes.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Primeiro acesso' })).toBeVisible();

    // Validar na UI: Doctor em nenhum momento possui botão de redefinir senha
    await expect(page.getByRole('button', { name: 'Redefinir senha' })).toHaveCount(0);

    // 2. Extrair token de autenticação do médico
    const token = await page.evaluate(async () => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.includes('auth-token')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            return parsed.access_token || parsed?.currentSession?.access_token;
          }
        }
      }
      return null;
    });

    expect(token).toBeTruthy();

    // 3. Tentar chamar a Edge Function master-user-admin usando o token do Doctor
    const resetAttemptStatus = await page.evaluate(async ({ supabaseUrl, pubKey, authToken }) => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/master-user-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': pubKey,
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ action: 'reset_password', user_id: '8abe09fb-405b-4ccf-83fd-a72928e3a28f', temporary_password: 'CMIP123456' })
      });
      return resp.status;
    }, { supabaseUrl: SUPABASE_URL, pubKey: PUBLISHABLE_KEY, authToken: token });

    // Especificação 11.D: Doctor tentando acessar reset administrativo -> 403 Forbidden esperado
    // Se o backend responder 200, este assert falha e aponta a falha de autorização na Edge Function remota
    expect(resetAttemptStatus).toBe(403);
  });

  test('8, 9 e 10 - Reset Administrativo por Admin/Master e Novo Ciclo de Primeiro Acesso', async ({ page }) => {
    test.skip(!hasSuperuser, 'Credenciais reais de Admin/Master ausentes no ambiente Playwright (E2E_MASTER_EMAIL / E2E_MASTER_PASSWORD ou E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD). Conforme regra 14, o teste não é falsificado e é marcado como não executado.');

    const superuserEmail = masterEmail || adminEmail;
    const superuserPassword = masterPassword || adminPassword;

    // Login Admin / Master
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Usuário').fill(superuserEmail);
    await page.getByPlaceholder('Senha').fill(superuserPassword);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Se Master, ir para aba de Usuários
    const usersTab = page.getByRole('button', { name: 'Usuários' });
    if (await usersTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await usersTab.click();
    }

    // Localizar Leandro Nogueira
    const leandroRow = page.locator('div').filter({ hasText: 'Leandro Nogueira' }).filter({ has: page.getByRole('button', { name: 'Redefinir senha' }) }).last();
    await expect(leandroRow).toBeVisible();

    // Clicar em Redefinir Senha
    await leandroRow.getByRole('button', { name: 'Redefinir senha' }).click();

    // Validar modal aberto
    await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible();
    await page.screenshot({ path: 'evidences/08-admin-reset-modal.png' });

    // Confirmar ação e capturar chamada real a master-user-admin
    const [resetRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('functions/v1/master-user-admin')),
      page.getByRole('button', { name: 'Confirmar redefinição' }).click()
    ]);

    expect(resetRes.status()).toBe(200);
    const reqHeaders = resetRes.request().headers();
    expect(reqHeaders['authorization']).toBeTruthy();
    expect(JSON.stringify(reqHeaders)).not.toContain('service_role');

    const resetData = await resetRes.json();
    expect(resetData.ok).toBe(true);

    await expect(page.getByText('Senha redefinida com sucesso')).toBeVisible();
    await page.screenshot({ path: 'evidences/09-admin-reset-success.png' });

    // Fechar modal e deslogar
    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.getByRole('button', { name: /Sair/i }).click();
    await expect(page.getByPlaceholder('Usuário')).toBeVisible();

    // Ciclo completo: Novo login do Leandro com senha temporária
    await page.getByPlaceholder('Usuário').fill(LEANDRO_USERNAME);
    await page.getByPlaceholder('Senha').fill(INITIAL_TEMP_PASSWORD);

    const [secondLoginRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('functions/v1/username-login')),
      page.getByRole('button', { name: 'Entrar' }).click()
    ]);

    expect(secondLoginRes.status()).toBe(200);
    const secondData = await secondLoginRes.json();
    expect(secondData.success).toBe(true);
    expect(secondData.profile.must_change_password).toBe(true);

    // Validar que voltou para tela de troca obrigatória e módulo médico bloqueado
    await expect(page.getByRole('heading', { name: 'Primeiro acesso' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Minha fila' })).toHaveCount(0);
    await page.screenshot({ path: 'evidences/10-leandro-must-change-after-reset.png' });
  });

  test('11.C - Admin tentando redefinir Master é bloqueado', async ({ page }) => {
    test.skip(!adminEmail || !adminPassword, 'Credenciais reais de Admin ausentes (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD).');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Usuário').fill(adminEmail);
    await page.getByPlaceholder('Senha').fill(adminPassword);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Admin não lista Master nem pode redefini-lo
    await expect(page.getByRole('heading', { name: 'Administração' })).toBeVisible();
    await expect(page.getByText('master', { exact: true })).toHaveCount(0);
  });

});
