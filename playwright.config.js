import { defineConfig, devices } from '@playwright/test';

// Os testes com mocks rodam contra um build com variáveis fictícias (nenhuma rede real).
// Para o E2E real (E2E_REAL=1), exporte VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY do projeto de teste.
export const E2E_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://e2e-mock.supabase.co';
export const E2E_SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'e2e-mock-key';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Permite apontar para um Chromium já instalado (ex.: PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] }
      : {},
  },
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: { VITE_SUPABASE_URL: E2E_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: E2E_SUPABASE_KEY },
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
