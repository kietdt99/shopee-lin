import { defineConfig, devices } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        defaultBrowserType: 'chromium',
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      VITE_SUPABASE_URL: 'https://playwright-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_playwright_test_key',
      VITE_PAYEE_NAME: 'Bé Kịt Thần Kỳ',
      VITE_PAYEE_ACCOUNT: '0000000000',
      VITE_PAYEE_BANK: 'TPB',
    },
  },
})
