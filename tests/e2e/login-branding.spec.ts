import { test, expect, mockSupabase } from './fixtures'

test('hosted login shows ShopeeLin branding without the obsolete personal intro', async ({ page }) => {
  await mockSupabase(page, 'viewer')
  const configuredPort = Number(process.env.PLAYWRIGHT_PORT_BASE) || 4173
  await page.goto(`http://127.0.0.1:${configuredPort + 1}/`)

  await expect.soft(page.locator('.brand-mark')).toBeVisible()
  await expect.soft(page.getByText('ShopeeLin', { exact: true })).toBeVisible()
  await expect.soft(page.getByRole('heading', { name: 'Bé Lin', exact: true })).toHaveCount(0)
  await expect.soft(page.getByText('Đăng nhập bằng email và mật khẩu.', { exact: true })).toHaveCount(0)

  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Mật Khẩu' })).toBeVisible()
})
