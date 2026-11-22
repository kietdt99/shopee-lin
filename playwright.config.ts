import { defineConfig, devices } from '@playwright/test'

// Keep the base URL and webServer ports identical in the runner and workers.
// Parallel test invocations must use unique ports and output directories.
const configuredPort = Number(process.env.PLAYWRIGHT_PORT_BASE) || 4173
const qrFallbackPort = configuredPort + 1
const qrNoImagePort = configuredPort + 2

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${configuredPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome-desktop',
      testIgnore: ['**/qr-fallback.spec.ts', '**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'edge-desktop',
      testIgnore: ['**/qr-fallback.spec.ts', '**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
    {
      name: 'chrome-hosted-auth',
      testMatch: ['**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: `http://127.0.0.1:${qrFallbackPort}`,
      },
    },
    {
      name: 'edge-hosted-auth',
      testMatch: ['**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
        baseURL: `http://127.0.0.1:${qrFallbackPort}`,
      },
    },
    {
      name: 'chrome-mobile-390',
      testIgnore: ['**/qr-fallback.spec.ts', '**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: {
        ...devices['Pixel 7'],
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'edge-mobile-390',
      testIgnore: ['**/qr-fallback.spec.ts', '**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: {
        ...devices['Pixel 7'],
        channel: 'msedge',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'chrome-mobile-320',
      testIgnore: ['**/qr-fallback.spec.ts', '**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: {
        viewport: { width: 320, height: 800 },
        isMobile: true,
        hasTouch: true,
        channel: 'chrome',
      },
    },
    {
      name: 'edge-mobile-320',
      testIgnore: ['**/qr-fallback.spec.ts', '**/auth-login-failure.spec.ts', '**/auth-routing.spec.ts'],
      use: {
        viewport: { width: 320, height: 800 },
        isMobile: true,
        hasTouch: true,
        channel: 'msedge',
      },
    },
    {
      name: 'chrome-qr-fallback',
      testMatch: '**/qr-fallback.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        baseURL: `http://127.0.0.1:${qrFallbackPort}`,
      },
    },
    {
      name: 'edge-qr-fallback',
      testMatch: '**/qr-fallback.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
        baseURL: `http://127.0.0.1:${qrFallbackPort}`,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${configuredPort} --strictPort`,
      url: `http://127.0.0.1:${configuredPort}`,
      reuseExistingServer: false,
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
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_SUPABASE_URL: 'https://playwright-test.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_playwright_test_key',
        VITE_PAYEE_NAME: '',
        VITE_PAYEE_ACCOUNT: '',
        VITE_PAYEE_BANK: 'TPB',
      },
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${qrNoImagePort} --strictPort`,
      url: `http://127.0.0.1:${qrNoImagePort}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_playwright_test_key',
        VITE_LOCAL_LOGIN_SHORTCUTS: 'true',
        VITE_LOCAL_ADMIN_EMAIL: 'tuankiet141199@gmail.com',
        VITE_LOCAL_VIEWER_EMAIL: 'tuankiet141199+lin-test@gmail.com',
        VITE_LOCAL_DEV_PASSWORD: 'Shopee-Lin-Local-Only-2026',
      },
    },
  ],
})
