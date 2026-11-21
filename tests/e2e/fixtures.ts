import { test as base, expect, type Page } from '@playwright/test'

export type TestRole = 'admin' | 'viewer'

const userIds: Record<TestRole, string> = {
  admin: '00000000-0000-4000-8000-000000000001',
  viewer: '00000000-0000-4000-8000-000000000002',
}

const profiles = [
  {
    id: userIds.admin,
    email: 'admin@example.test',
    full_name: 'Bé Kịt Thần Kỳ',
    role: 'admin',
  },
  {
    id: userIds.viewer,
    email: 'viewer@example.test',
    full_name: 'Bé Lin Tốc Độ Cao',
    role: 'viewer',
  },
]

export async function mockSupabase(page: Page, role: TestRole) {
  const userId = userIds[role]
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: role === 'admin' ? 'admin@example.test' : 'viewer@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
  }
  const authSession = {
    access_token: `test-access-token-${role}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `test-refresh-token-${role}`,
    user,
  }

  await page.route('https://playwright-test.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      const body = request.postDataJSON() as { email?: string; password?: string }
      const expectedEmail = role === 'admin' ? 'admin@example.test' : 'viewer@example.test'
      if (body.email !== expectedEmail || body.password !== 'test-password') {
        await route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } })
        return
      }
      await route.fulfill({ status: 200, json: authSession })
      return
    }

    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
      await route.fulfill({ status: 200, json: user })
      return
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').at(-1)
      let data: unknown = []
      if (table === 'profiles') {
        data = url.searchParams.has('id')
          ? profiles.find((profile) => profile.id === url.searchParams.get('id')?.replace('eq.', '')) ?? null
          : profiles
      } else if (table === 'installment_summary') {
        data = [{ id: 's25-ultra', name: 'S25 Ultra', total_amount: 20_000_000, total_paid: 2_000_000 }]
      }

      await route.fulfill({
        status: 200,
        headers: { 'content-range': Array.isArray(data) ? `0-${Math.max(data.length - 1, 0)}/${data.length}` : '0-0/1' },
        json: data,
      })
      return
    }

    if (url.pathname === '/functions/v1/admin-reset-password-link' && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        json: {
          actionLink: 'https://playwright-test.supabase.co/auth/v1/verify?token=test-recovery-token&type=recovery',
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      })
      return
    }

    if (url.pathname.startsWith('/auth/v1/')) {
      await route.fulfill({ status: 404, json: { message: 'Unexpected mocked Auth request' } })
      return
    }

    await route.fulfill({ status: 404, json: { message: `Unexpected request: ${url.pathname}` } })
  })
}

export const test = base.extend<{ expectNoHorizontalOverflow: () => Promise<void> }>({
  expectNoHorizontalOverflow: async ({ page }, use) => {
    await use(async () => {
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }))
      expect(dimensions.content, `page content overflows viewport (${dimensions.content}px > ${dimensions.viewport}px)`).toBeLessThanOrEqual(dimensions.viewport)
    })
  },
})

export { expect }

export async function signIn(page: Page, role: TestRole) {
  const email = role === 'admin' ? 'admin@example.test' : 'viewer@example.test'
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('heading', { name: 'Bé Lin' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tổng quan' })).toBeVisible()
}
