import { test, expect, mockSupabase, signIn } from './fixtures'
import type { Page } from '@playwright/test'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const safeCallbackState = 'qa-auth-routing-state'

async function expectSafeAppUrl(page: Page, query: string) {
  await expect(page).toHaveURL((url: URL) =>
    url.pathname === '/'
    && url.search === query
    && url.hash === `#state=${safeCallbackState}`,
  )
  await expect(page).not.toHaveURL(/[?&#](?:access_token|refresh_token|code)=[^&]+/i)
}

test('valid password setup marker opens the setup view and preserves safe URL state', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await page.goto('/')
  await signIn(page, 'admin')

  await page.goto(`/?campaign=qa&set-password=1#state=${safeCallbackState}`)
  await expect(page.getByRole('heading', { name: 'Đặt Mật Khẩu' })).toBeVisible()
  await expect(page).toHaveURL((url) =>
    url.pathname === '/'
    && url.searchParams.get('campaign') === 'qa'
    && url.searchParams.get('set-password') === '1'
    && url.hash === `#state=${safeCallbackState}`,
  )

  await page.getByLabel('Mật Khẩu Mới').fill('new-test-password')
  await page.getByRole('button', { name: 'Lưu Mật Khẩu' }).click()

  await expect(page.getByRole('button', { name: 'Tổng Quan', exact: true })).toBeVisible()
  await expectSafeAppUrl(page, '?campaign=qa')
})

test('expired activation callback stays on login instead of opening password setup', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await page.goto(`/?campaign=qa&set-password=1&error_code=otp_expired#state=${safeCallbackState}`)

  await expect(page.getByText('Liên kết khôi phục đã hết hạn. Nhắn bé Kịt tạo liên kết mới nhé.')).toBeVisible()
  await expect(page).toHaveURL((url) =>
    url.pathname === '/'
    && url.searchParams.get('campaign') === 'qa'
    && url.searchParams.get('error_code') === 'otp_expired'
    && url.hash === `#state=${safeCallbackState}`,
  )
  await expect(page).not.toHaveURL(/[?&#](?:access_token|refresh_token|code)=[^&]+/i)
  await expect(page.getByRole('heading', { name: 'Đặt Mật Khẩu' })).toHaveCount(0)
  await expect(page.getByLabel('Email')).toBeVisible()
})

test('signed-in session restores after refresh and reopening Orders in another tab', async ({ page, context }) => {
  const requestedUrl = `/?campaign=qa&tab=orders#state=${safeCallbackState}`
  await mockSupabase(page, 'admin')
  await page.goto('/')
  await signIn(page, 'admin')
  await page.goto(requestedUrl)
  await expect(page.getByRole('heading', { name: 'Đơn Hàng' })).toBeVisible()
  await expect(page).toHaveURL(requestedUrl)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Đơn Hàng' })).toBeVisible()
  await expect(page).toHaveURL(requestedUrl)

  const returnedTab = await context.newPage()
  await mockSupabase(returnedTab, 'admin')
  await returnedTab.goto(requestedUrl)
  await expect(returnedTab.getByRole('heading', { name: 'Đơn Hàng' })).toBeVisible()
  await expect(returnedTab).toHaveURL(requestedUrl)

  await returnedTab.close()
  await page.bringToFront()
  await expect(page.getByRole('heading', { name: 'Đơn Hàng' })).toBeVisible()
  await expect(page).toHaveURL(requestedUrl)
})
