import { test, expect, mockSupabase, signIn } from './fixtures'

test('Hosted login form rejects an invalid password', async ({ page }) => {
  await mockSupabase(page, 'viewer')
  await page.goto('/')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Mật Khẩu')).toBeVisible()
  await page.getByLabel('Email').fill('viewer@example.test')
  await page.getByLabel('Mật Khẩu').fill('wrong-password')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByText('Email hoặc mật khẩu chưa đúng.')).toBeVisible()
})

test('Viewer sees the payment QR fallback when recipient details are unconfigured', async ({ page }) => {
  await mockSupabase(page, 'viewer')
  await page.goto('/')
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Thanh toán' }).click()

  const paymentDialog = page.getByRole('dialog', { name: 'Thanh toán' })
  await expect(paymentDialog.getByText('Chưa có ảnh QR thanh toán.')).toBeVisible()
  await expect(paymentDialog.locator('img')).toHaveCount(0)
  await expect(paymentDialog.locator('.payment-note')).toHaveText('Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé 😘')
  await expect(paymentDialog.getByText('Chưa cấu hình tên người nhận')).toHaveCount(0)
  await expect(paymentDialog.getByText(/Chưa cấu hình số tài khoản/)).toHaveCount(0)
})
