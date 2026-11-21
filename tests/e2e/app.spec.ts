import { test, expect, mockSupabase, signIn } from './fixtures'
import type { MockCycle, MockOrder } from './fixtures'

const mayCycle: MockCycle = { id: 'cycle-may-2026', label: '05.2026', starts_on: '2026-04-21', ends_on: '2026-05-20', opening_balance: 0, status: 'open' }
const juneCycle: MockCycle = { id: 'cycle-june-2026', label: '06.2026', starts_on: '2026-05-21', ends_on: '2026-06-20', opening_balance: 0, status: 'open' }
const januaryCycle: MockCycle = { id: 'cycle-january-2027', label: '01.2027', starts_on: '2026-12-21', ends_on: '2027-01-20', opening_balance: 0, status: 'open' }

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

test('User can edit only the display name shown in their session', async ({ page }) => {
  const mock = await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Sửa display name' }).click()
  const dialog = page.getByRole('dialog', { name: 'Đổi display name' })
  await dialog.getByLabel('Display name').fill('Bé Lin Test UI')
  await dialog.getByRole('button', { name: 'Lưu tên hiển thị' }).click()

  await expect(page.locator('.profile-name')).toHaveText('Bé Lin Test UI')
  expect(mock.profiles.find((profile) => profile.id.endsWith('000000000002'))?.full_name).toBe('Bé Lin Test UI')
  expect(mock.requests.find((request) => request.path === '/rest/v1/rpc/update_my_display_name')?.body).toEqual({ p_display_name: 'Bé Lin Test UI' })
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

test('Admin creates and edits orders on the 20th/21st cycle boundary', async ({ page }) => {
  const mock = await mockSupabase(page, 'admin', { cycles: [mayCycle, juneCycle, januaryCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn hàng' }).click()

  const boundaryCases = [
    { description: 'Order on May 20', date: '2026-05-20', cycleId: mayCycle.id },
    { description: 'Order on May 21', date: '2026-05-21', cycleId: juneCycle.id },
    { description: 'Order on Dec 21', date: '2026-12-21', cycleId: januaryCycle.id },
  ]

  for (const item of boundaryCases) {
    await page.getByRole('button', { name: 'Thêm đơn' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thêm đơn hàng' })
    await dialog.getByLabel('Mô tả đơn').fill(item.description)
    await dialog.getByLabel('Ngày đặt').fill(item.date)
    await dialog.getByLabel('Số tiền (VND)').fill('120000')
    await dialog.getByRole('button', { name: 'Lưu đơn hàng' }).click()
    await expect(page.getByText(item.description)).toBeVisible()
  }

  const inserted = mock.requests.filter((request) => request.method === 'POST' && request.path === '/rest/v1/orders')
  expect(inserted.map((request) => [request.body.placed_at, request.body.billing_cycle_id])).toEqual([
    ['2026-05-20', mayCycle.id],
    ['2026-05-21', juneCycle.id],
    ['2026-12-21', januaryCycle.id],
  ])

  const mayRow = page.locator('.order-row').filter({ hasText: 'Order on May 20' })
  await mayRow.getByRole('button', { name: 'Sửa đơn' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Sửa đơn hàng' })
  await editDialog.getByLabel('Số tiền (VND)').fill('135000')
  await editDialog.getByRole('button', { name: 'Lưu đơn hàng' }).click()
  await expect(mayRow.getByText('135.000')).toBeVisible()
  const update = mock.requests.find((request) => request.method === 'PATCH' && request.path === '/rest/v1/orders')
  expect(update?.body).toMatchObject({ description: 'Order on May 20', placed_at: '2026-05-20', amount: 135000, billing_cycle_id: mayCycle.id })
})

test('Admin allocates one partial payment across multiple orders and rejects excess payment', async ({ page }) => {
  const cycle = { ...mayCycle }
  const orders: MockOrder[] = [
    { id: 'order-first', description: 'First order', placed_at: '2026-05-02', amount: 1000, status: 'unpaid', billing_cycle_id: cycle.id },
    { id: 'order-second', description: 'Second order', placed_at: '2026-05-03', amount: 2000, status: 'unpaid', billing_cycle_id: cycle.id },
  ]
  const mock = await mockSupabase(page, 'admin', { orders, cycles: [cycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn hàng' }).click()
  await page.getByLabel('Chọn First order').check()
  await page.getByLabel('Chọn Second order').check()

  page.once('dialog', async (dialog) => await dialog.accept('2200'))
  await page.getByRole('button', { name: 'Ghi nhận khoản đã nhận' }).click()

  await expect(page.locator('.order-row').filter({ hasText: 'First order' }).getByText('Đã trả')).toBeVisible()
  const secondRow = page.locator('.order-row').filter({ hasText: 'Second order' })
  await expect(secondRow.getByText('Chưa trả')).toBeVisible()
  await expect(secondRow.getByText(/Còn/)).toBeVisible()
  const paymentRequest = mock.requests.find((request) => request.path === '/rest/v1/rpc/record_order_payment')
  expect(paymentRequest?.body).toMatchObject({ p_order_ids: ['order-first', 'order-second'], p_amount: 2200, p_note: 'Admin xác nhận thanh toán' })
  expect(mock.payments).toHaveLength(1)
  expect(mock.allocations.map((allocation) => [allocation.order_id, allocation.amount])).toEqual([['order-first', 1000], ['order-second', 1200]])

  await page.getByLabel('Chọn Second order').check()
  const dialogTypes: string[] = []
  const acceptDialogs = async (dialog: import('@playwright/test').Dialog) => {
    dialogTypes.push(dialog.type())
    await dialog.accept(dialog.type() === 'prompt' ? '900' : undefined)
  }
  page.on('dialog', acceptDialogs)
  await page.getByRole('button', { name: 'Ghi nhận khoản đã nhận' }).click()
  await expect.poll(() => dialogTypes).toEqual(['prompt', 'alert'])
  page.off('dialog', acceptDialogs)
  await expect(secondRow.getByText('Chưa trả')).toBeVisible()
  expect(mock.payments).toHaveLength(1)
})

test('Admin cancels a paid order and records a refund adjustment', async ({ page }) => {
  const order: MockOrder = { id: 'order-paid', description: 'Refunded order', placed_at: '2026-05-02', amount: 5000, status: 'paid', billing_cycle_id: mayCycle.id }
  const payment = { id: 'payment-existing', paid_at: '2026-05-04', amount: 5000, note: null }
  const allocation = { payment_id: payment.id, order_id: order.id, amount: 5000 }
  const mock = await mockSupabase(page, 'admin', { orders: [order], cycles: [mayCycle], payments: [payment], allocations: [allocation] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn hàng' }).click()

  const dialogTypes: string[] = []
  const acceptDialogs = async (dialog: import('@playwright/test').Dialog) => {
    dialogTypes.push(dialog.type())
    await dialog.accept(dialog.type() === 'prompt' ? '4500' : undefined)
  }
  page.on('dialog', acceptDialogs)
  await page.locator('.order-row').filter({ hasText: 'Refunded order' }).getByRole('button', { name: 'Hủy đơn' }).click()
  await expect.poll(() => dialogTypes).toEqual(['confirm', 'prompt'])
  page.off('dialog', acceptDialogs)

  await expect(page.locator('.order-row').filter({ hasText: 'Refunded order' }).getByText('Đã hủy')).toBeVisible()
  const cancelRequest = mock.requests.find((request) => request.path === '/rest/v1/rpc/cancel_order')
  expect(cancelRequest?.body).toMatchObject({ p_order_id: order.id, p_refund_amount: 4500, p_note: 'Hoàn tiền đơn Refunded order' })
  expect(mock.ledgerEntries).toHaveLength(1)
  expect(mock.ledgerEntries[0]).toMatchObject({ kind: 'refund', amount: 4500, billing_cycle_id: mayCycle.id })
})

test('Admin deletes a fully unpaid order after confirmation', async ({ page }) => {
  const order: MockOrder = { id: 'order-delete', description: 'Unpaid test order', placed_at: '2026-05-02', amount: 9000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const mock = await mockSupabase(page, 'admin', { orders: [order], cycles: [mayCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn hàng' }).click()

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    await dialog.accept()
  })
  await page.locator('.order-row').filter({ hasText: 'Unpaid test order' }).getByRole('button', { name: 'Hủy đơn' }).click()

  await expect(page.getByText('Chưa có đơn hàng.')).toBeVisible()
  expect(mock.requests.some((request) => request.method === 'DELETE' && request.path === '/rest/v1/orders' && request.query.includes('order-delete'))).toBe(true)
})

test('Admin exports the selected cycle as an Excel-compatible report', async ({ page }) => {
  const order: MockOrder = { id: 'order-may', description: 'May report item', placed_at: '2026-05-19', amount: 250000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const payment = { id: 'payment-may', paid_at: '2026-05-20', amount: 75000, note: 'Bé Lin chuyển khoản' }
  const mock = await mockSupabase(page, 'admin', { orders: [order], cycles: [mayCycle, juneCycle], payments: [payment] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Báo cáo' }).click()
  await page.getByLabel('Kỳ sổ').selectOption(mayCycle.id)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất Excel' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('bao-cao-05.2026.xls')
  const filePath = await download.path()
  expect(filePath).not.toBeNull()
  const { readFile } = await import('node:fs/promises')
  const contents = await readFile(filePath!, 'utf8')
  expect(contents).toContain('<Workbook')
  expect(contents).toContain('May report item')
  expect(contents).toContain('250000')
  expect(contents).toContain('Bé Lin chuyển khoản')
  expect(contents).toContain('75000')
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
})

test('Print report action invokes print and print media hides app navigation/actions', async ({ page }) => {
  await mockSupabase(page, 'admin', { cycles: [mayCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Báo cáo' }).click()
  await page.evaluate(() => {
    window.print = () => { document.documentElement.dataset.printInvoked = 'true' }
  })
  await page.getByRole('button', { name: 'Lưu PDF' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-print-invoked', 'true')

  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.tabs')).toBeHidden()
  await expect(page.locator('.report-actions')).toBeHidden()
  await expect(page.locator('.report-orders')).toBeVisible()
})
