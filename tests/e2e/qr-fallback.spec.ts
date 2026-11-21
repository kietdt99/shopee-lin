import { test, expect, mockSupabase, signIn } from './fixtures'

test('Viewer sees the payment QR fallback when recipient details are unconfigured', async ({ page }) => {
  await mockSupabase(page, 'viewer')
  await page.goto('/')
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Thanh toán' }).click()

  await expect(page.getByText('QR chưa được cấu hình.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Mã VietQR thanh toán' })).toHaveCount(0)
  await expect(page.getByText('Chưa cấu hình tên người nhận')).toBeVisible()
  await expect(page.getByText('TPB · Chưa cấu hình số tài khoản')).toBeVisible()
  await expect(page.getByText('Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.')).toBeVisible()
})
