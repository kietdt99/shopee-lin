import { defineConfig, devices } from '@playwright/test'

const configuredPort = 4173
const qrFallbackPort = 4174

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${configuredPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: '**/qr-fallback.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-390-chromium',
      testIgnore: '**/qr-fallback.spec.ts',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'mobile-320-chromium',
      testIgnore: '**/qr-fallback.spec.ts',
      use: {
        viewport: { width: 320, height: 800 },
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'qr-fallback-chromium',
      testMatch: '**/qr-fallback.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${qrFallbackPort}`,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${configuredPort} --strictPort`,
      url: `http://127.0.0.1:${configuredPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_playwright_test_key',
        VITE_LOCAL_LOGIN_SHORTCUTS: 'true',
        VITE_LOCAL_ADMIN_EMAIL: 'tuankiet141199@gmail.com',
        VITE_LOCAL_VIEWER_EMAIL: 'tuankiet141199+lin-test@gmail.com',
        VITE_LOCAL_DEV_PASSWORD: 'Shopee-Lin-Local-Only-2026',
        VITE_PAYEE_NAME: 'Bé Kịt Thần Kỳ',
        VITE_PAYEE_ACCOUNT: '0000000000',
        VITE_PAYEE_BANK: 'TPB',
      },
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${qrFallbackPort} --strictPort`,
      url: `http://127.0.0.1:${qrFallbackPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        VITE_SUPABASE_URL: 'https://playwright-test.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_playwright_test_key',
        VITE_PAYEE_NAME: '',
        VITE_PAYEE_ACCOUNT: '',
        VITE_PAYEE_BANK: 'TPB',
      },
    },
  ],
})
