import { test, expect } from '@playwright/test';
const accounts=[['master','E2E_MASTER_EMAIL','E2E_MASTER_PASSWORD'],['admin','E2E_ADMIN_EMAIL','E2E_ADMIN_PASSWORD'],['receptionist','E2E_RECEPTION_EMAIL','E2E_RECEPTION_PASSWORD'],['doctor','E2E_DOCTOR_A_EMAIL','E2E_DOCTOR_A_PASSWORD']];
test('username chama Edge Function username-login e exibe erro 401 amigável', async ({ page }) => {
  await page.route('**/functions/v1/username-login', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Credenciais inválidas' })
  }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Usuário').fill('joao.vicente');
  await page.getByPlaceholder('Senha').fill('senhaErrada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible();
});

test('username trata falha 500 da Edge Function amigavelmente', async ({ page }) => {
  await page.route('**/functions/v1/username-login', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Erro interno' })
  }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Usuário').fill('joao.vicente');
  await page.getByPlaceholder('Senha').fill('senha123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Não foi possível autenticar no momento.')).toBeVisible();
});
for(const [role,ek,pk] of accounts)test(`login ${role}`,async({page})=>{test.skip(!process.env[ek]||!process.env[pk],`Credenciais ${role} ausentes`);await page.goto('/');await page.getByPlaceholder('Usuário').fill(process.env[ek]);await page.getByPlaceholder('Senha').fill(process.env[pk]);await page.getByRole('button',{name:'Entrar'}).click();await expect(page.getByText(role,{exact:true}).first()).toBeVisible();await page.getByRole('button',{name:/Sair/}).click();});
test('primeiro acesso exige troca de senha',async({page})=>{test.skip(!process.env.E2E_FIRST_ACCESS_EMAIL||!process.env.E2E_FIRST_ACCESS_PASSWORD,'Conta de primeiro acesso ausente');await page.goto('/');await page.getByPlaceholder('Usuário').fill(process.env.E2E_FIRST_ACCESS_EMAIL);await page.getByPlaceholder('Senha').fill(process.env.E2E_FIRST_ACCESS_PASSWORD);await page.getByRole('button',{name:'Entrar'}).click();await expect(page.getByRole('heading',{name:'Primeiro acesso'})).toBeVisible();});
