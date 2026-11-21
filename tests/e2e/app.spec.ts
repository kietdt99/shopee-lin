import { test, expect, mockSupabase, signIn } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.route('https://img.vietqr.io/**', (route) => route.abort())
  await page.goto('/')
})

test('login screen fits desktop and mobile viewports', async ({ page, expectNoHorizontalOverflow }) => {
  await expect(page.getByRole('heading', { name: 'Bé Lin' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expectNoHorizontalOverflow()
})

test('Admin can open account management and viewer does not see it', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')
  await expect(page.getByRole('button', { name: 'Tài khoản' })).toBeVisible()
  await page.getByRole('button', { name: 'Tài khoản' }).click()
  await expect(page.getByRole('heading', { name: 'Quản lý tài khoản' })).toBeVisible()
  await expect(page.getByText('Bé Lin Tốc Độ Cao')).toBeVisible()
  await page.getByRole('button', { name: 'Reset password' }).click()
  await expect(page.getByRole('dialog', { name: 'Reset password' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tạo recovery link' })).toBeVisible()
  await page.getByRole('button', { name: 'Tạo recovery link' }).click()
  await expect(page.getByLabel('Recovery link')).toHaveValue(/test-recovery-token/)
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
  await expectNoHorizontalOverflow()
})

test('Viewer sees read-only navigation and the payment QR dialog', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')
  await expect(page.getByRole('button', { name: 'Tài khoản' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Thanh toán' }).click()
  await expect(page.getByRole('dialog', { name: 'Thanh toán' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Mã VietQR thanh toán' })).toHaveAttribute('src', /vietqr\.io\/image\/TPB-0000000000/)
  await expect(page.getByText('Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.')).toBeVisible()
  await expectNoHorizontalOverflow()
})

test('Viewer can open orders, installments, and reports on responsive layouts', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')

  await page.getByRole('button', { name: 'Đơn hàng' }).click()
  await expect(page.getByRole('heading', { name: 'Đơn hàng' })).toBeVisible()
  await expect(page.getByText('Chưa có đơn hàng.')).toBeVisible()
  await expectNoHorizontalOverflow()

  await page.getByRole('button', { name: 'Trả góp' }).click()
  await expect(page.getByRole('heading', { name: 'Trả góp' })).toBeVisible()
  await expect(page.getByText('S25 Ultra')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Thêm lần góp' })).toHaveCount(0)
  await expectNoHorizontalOverflow()

  await page.getByRole('button', { name: 'Báo cáo' }).click()
  await expect(page.getByRole('heading', { name: 'Báo cáo kỳ' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Khóa sổ kỳ này' })).toHaveCount(0)
  await expectNoHorizontalOverflow()
})

test('invalid password displays a login error', async ({ page }) => {
  await mockSupabase(page, 'viewer')
  await page.getByLabel('Email').fill('viewer@example.test')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByText('Email hoặc password chưa đúng.')).toBeVisible()
})
