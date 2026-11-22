import { test, expect, mockSupabase } from './fixtures'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

test('failed normal password login stays on login and preserves safe URL state', async ({ page }) => {
  const mock = await mockSupabase(page, 'admin')
  const returnUrl = '/?campaign=qa#state=qa-login-state'
  await page.goto(returnUrl)

  await page.getByLabel('Email').fill('admin@example.test')
  await page.getByLabel('Mật Khẩu').fill('incorrect-test-password')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()

  await expect(page.getByText('Email hoặc mật khẩu chưa đúng.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ShopeeLin' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Đặt Mật Khẩu' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tổng Quan', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(returnUrl)
  await expect(page).not.toHaveURL(/[?&#](?:access_token|refresh_token|code)=[^&]+/i)
  expect(mock.requests.filter((request) => request.path === '/auth/v1/token')).toHaveLength(1)
  expect(mock.requests.some((request) => request.path === '/auth/v1/otp' || request.path === '/auth/v1/recover')).toBe(false)
})
