import { test, expect, mockSupabase } from './fixtures'

test('ordinary password login ignores a stale password-setup marker', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await page.addInitScript(() => localStorage.setItem('shopee-lin-password-setup', 'true'))
  await page.goto('/')

  await page.getByTestId('local-login-admin').click()

  await expect(page.getByRole('button', { name: 'Tổng Quan', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Đặt Mật Khẩu' })).toHaveCount(0)
})
