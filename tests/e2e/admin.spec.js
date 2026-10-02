import { test, expect } from '@playwright/test';
async function login(page,emailKey,passwordKey){test.skip(!process.env[emailKey]||!process.env[passwordKey],'Credenciais ausentes');await page.goto('/');await page.getByPlaceholder('Usuário').fill(process.env[emailKey]);await page.getByPlaceholder('Senha').fill(process.env[passwordKey]);await page.getByRole('button',{name:'Entrar'}).click();}

test('admin não recebe Master na listagem comum',async({page})=>{await login(page,'E2E_ADMIN_EMAIL','E2E_ADMIN_PASSWORD');await expect(page.getByRole('heading',{name:'Administração'})).toBeVisible();await expect(page.getByText('master',{exact:true})).toHaveCount(0);});

test('admin navega para Recepção e contexto médico delegado',async({page})=>{await login(page,'E2E_ADMIN_EMAIL','E2E_ADMIN_PASSWORD');await page.getByRole('button',{name:'Recepção'}).click();await expect(page.getByRole('heading',{name:'Chamar Próximo Paciente'})).toBeVisible();await page.getByRole('button',{name:'Atuar como médico'}).click();await expect(page.getByLabel('Atuar como médico')).toBeVisible();});

test('master mantém administração e recebe módulos operacionais',async({page})=>{await login(page,'E2E_MASTER_EMAIL','E2E_MASTER_PASSWORD');await expect(page.getByRole('button',{name:'Administração Master'})).toBeVisible();await expect(page.getByRole('button',{name:'Recepção'})).toBeVisible();await expect(page.getByRole('button',{name:'Atuar como médico'})).toBeVisible();await expect(page.getByRole('heading',{name:'Visão geral'})).toBeVisible();});
