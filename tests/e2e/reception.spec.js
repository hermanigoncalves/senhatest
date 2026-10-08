import { test, expect } from '@playwright/test';
async function login(page){test.skip(!process.env.E2E_RECEPTION_EMAIL||!process.env.E2E_RECEPTION_PASSWORD,'Credenciais ausentes');await page.goto('/');await page.getByPlaceholder('Usuário').fill(process.env.E2E_RECEPTION_EMAIL);await page.getByPlaceholder('Senha').fill(process.env.E2E_RECEPTION_PASSWORD);await page.getByRole('button',{name:'Entrar'}).click();}
test('chamador 150, 151, específica e rechamada',async({page})=>{
  await login(page);
  await page.getByLabel('Senha inicial').fill('150');
  await page.getByRole('button',{name:'Definir',exact:true}).click();
  await expect(page.getByText(/Próxima senha definida como 0150/)).toBeVisible();
  await page.getByRole('button',{name:'CHAMAR PRÓXIMA'}).click();
  await expect(page.getByText(/Senha 0150 chamada/)).toBeVisible();
  await page.getByRole('button',{name:'CHAMAR PRÓXIMA'}).click();
  await expect(page.getByText(/Senha 0151 chamada/)).toBeVisible();
  await page.getByLabel('Senha específica').fill('777');
  await page.getByLabel('Senha específica').locator('xpath=..').getByRole('button',{name:'Chamar',exact:true}).click();
  await expect(page.getByText(/Senha 0777 chamada/)).toBeVisible();
  await page.getByRole('button',{name:'RECHAMAR'}).click();
  await expect(page.getByText(/Senha 0777 chamada/)).toBeVisible();
});
