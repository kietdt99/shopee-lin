import { test, expect, mockSupabase, signIn } from './fixtures'
import type { Locator } from '@playwright/test'
import type { MockCycle, MockOrder } from './fixtures'

const mayCycle: MockCycle = { id: 'cycle-may-2026', label: '05.2026', starts_on: '2026-04-21', ends_on: '2026-05-20', opening_balance: 0, status: 'open' }
const juneCycle: MockCycle = { id: 'cycle-june-2026', label: '06.2026', starts_on: '2026-05-21', ends_on: '2026-06-20', opening_balance: 0, status: 'open' }
const januaryCycle: MockCycle = { id: 'cycle-january-2027', label: '01.2027', starts_on: '2026-12-21', ends_on: '2027-01-20', opening_balance: 0, status: 'open' }

async function expectRequiredMarkerInline(labelTitle: Locator) {
  const metrics = await labelTitle.evaluate((title) => {
    const copy = title.querySelector('.label-copy')!.getBoundingClientRect()
    const marker = title.querySelector('.required-marker')!.getBoundingClientRect()
    return { gap: marker.left - copy.right, centerOffset: Math.abs((marker.top + marker.height / 2) - (copy.top + copy.height / 2)) }
  })
  expect(metrics.gap).toBeGreaterThanOrEqual(0)
  expect(metrics.gap).toBeLessThanOrEqual(4)
  expect(metrics.centerOffset).toBeLessThanOrEqual(2)
}

test.beforeEach(async ({ page }) => {
  await page.route('https://img.vietqr.io/**', (route) => route.abort())
  await page.goto('/')
})

test('login screen fits desktop and mobile viewports', async ({ page, expectNoHorizontalOverflow }) => {
  await expect(page.getByRole('heading', { name: 'Chọn Tài Khoản' })).toBeVisible()
  const admin = page.getByTestId('local-login-admin')
  await expect(admin).toContainText('Admin')
  await expect(admin).toContainText('Bé Kịt Thần Kỳ')
  await expect(admin).not.toContainText('tuankiet141199@gmail.com')
  const viewer = page.getByTestId('local-login-tester')
  await expect(viewer).toContainText('Viewer')
  await expect(viewer).toContainText('Tester Quèn')
  await expect(viewer).not.toContainText('tuankiet141199+lin-test@gmail.com')
  await expectNoHorizontalOverflow()
})

test('target desktop and Samsung mobile viewports use the expected content frame', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')

  const shell = page.locator('.app-shell')
  const targets = [
    { name: 'Desktop 2K 27-inch', width: 2560, height: 1440, expectedShellWidth: 2048 },
    { name: 'Laptop 14-inch', width: 1920, height: 1080, expectedShellWidth: 1920 },
    { name: 'Samsung S23 Ultra', width: 360, height: 780, expectedShellWidth: 360 },
    { name: 'Samsung S25 Ultra', width: 384, height: 832, expectedShellWidth: 384 },
  ]

  for (const target of targets) {
    await page.setViewportSize({ width: target.width, height: target.height })
    const bounds = await shell.boundingBox()
    expect(bounds, `${target.name}: shell should be visible`).not.toBeNull()
    expect(Math.abs(bounds!.width - target.expectedShellWidth), `${target.name}: shell width`).toBeLessThanOrEqual(1)
    if (target.width > 900) {
      expect(Math.abs((target.width - bounds!.width) / 2 - bounds!.x), `${target.name}: centered shell`).toBeLessThanOrEqual(1)
    }
    await expectNoHorizontalOverflow()
  }
})

test('sidebar is a distinct panel with profile and version in its footer', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')

  const sidebar = page.locator('.sidebar')
  const navigation = sidebar.getByRole('navigation', { name: 'Điều hướng' })
  const profile = sidebar.locator('.sidebar-profile')
  const profileName = sidebar.locator('.sidebar-profile-name')
  const profileRole = sidebar.locator('.sidebar-profile-role')
  const version = sidebar.getByText('v0.1.0')
  await expect(sidebar).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(profile).toBeVisible()
  const profileAction = sidebar.getByRole('button', { name: 'Hồ Sơ' })
  const signOutAction = sidebar.getByRole('button', { name: 'Đăng Xuất' })
  await expect(profileAction).toBeVisible()
  await expect(signOutAction).toBeVisible()
  await expect(profileAction).toHaveCSS('user-select', 'none')
  await expect(sidebar.getByRole('button', { name: 'Đơn Hàng' })).toHaveCSS('user-select', 'none')
  const profileActionBounds = await profileAction.boundingBox()
  const signOutActionBounds = await signOutAction.boundingBox()
  expect(profileActionBounds).not.toBeNull()
  expect(signOutActionBounds).not.toBeNull()
  if ((page.viewportSize()?.width ?? 0) <= 900) {
    expect(Math.abs(profileActionBounds!.y - signOutActionBounds!.y)).toBeLessThanOrEqual(1)
  } else {
    expect(signOutActionBounds!.y).toBeGreaterThan(profileActionBounds!.y)
  }
  await expect(profileRole).toHaveText('Admin')
  const roleStyling = await profileRole.evaluate((role) => ({
    fontSize: parseFloat(getComputedStyle(role).fontSize),
    color: getComputedStyle(role).color,
  }))
  const nameFontSize = await profileName.evaluate((name) => parseFloat(getComputedStyle(name).fontSize))
  expect(roleStyling.fontSize).toBeLessThan(nameFontSize)
  expect(roleStyling.color).toBe('rgb(139, 133, 129)')
  const profileMetaBounds = await sidebar.locator('.sidebar-profile-meta').boundingBox()
  const profileNameBounds = await profileName.boundingBox()
  const profileRoleBounds = await profileRole.boundingBox()
  expect(profileMetaBounds).not.toBeNull()
  expect(profileNameBounds).not.toBeNull()
  expect(profileRoleBounds).not.toBeNull()
  expect(profileRoleBounds!.y).toBeGreaterThanOrEqual(profileNameBounds!.y + profileNameBounds!.height - 1)
  expect(Math.abs((profileRoleBounds!.x + profileRoleBounds!.width / 2) - (profileMetaBounds!.x + profileMetaBounds!.width / 2))).toBeLessThanOrEqual(1)
  const actionLayout = await sidebar.locator('.sidebar-action').evaluateAll((actions) => actions.map((action) => ({ scrollHeight: action.scrollHeight, clientHeight: action.clientHeight })))
  expect(actionLayout.every((action) => action.scrollHeight <= action.clientHeight)).toBe(true)
  await expect(sidebar.getByRole('button', { name: 'Đăng Xuất' })).toBeVisible()
  const avatar = sidebar.locator('.sidebar-avatar')
  await expect(avatar).toBeVisible()
  await expect(avatar).toHaveAttribute('src', /avatar-default\.svg/)
  await expect.poll(() => avatar.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await expect(version).toBeVisible()

  const navBounds = await navigation.boundingBox()
  const profileBounds = await profile.boundingBox()
  const versionBounds = await version.boundingBox()
  const sidebarBounds = await sidebar.boundingBox()
  expect(navBounds).not.toBeNull()
  expect(profileBounds).not.toBeNull()
  expect(versionBounds).not.toBeNull()
  expect(sidebarBounds).not.toBeNull()
  expect(Math.abs(versionBounds!.x - profileBounds!.x)).toBeLessThanOrEqual(1)
  const sidebarPadding = await sidebar.evaluate((element) => {
    const style = getComputedStyle(element)
    return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), borderLeft: parseFloat(style.borderLeftWidth), borderRight: parseFloat(style.borderRightWidth) }
  })
  expect(Math.abs(navBounds!.x - (sidebarBounds!.x + sidebarPadding.left + sidebarPadding.borderLeft))).toBeLessThanOrEqual(1)
  expect(Math.abs(navBounds!.x + navBounds!.width - (sidebarBounds!.x + sidebarBounds!.width - sidebarPadding.right - sidebarPadding.borderRight))).toBeLessThanOrEqual(1)
  expect(profileBounds!.y).toBeGreaterThan(navBounds!.y + navBounds!.height)
  if ((page.viewportSize()?.width ?? 0) <= 900) {
    if ((page.viewportSize()?.width ?? 0) <= 440) {
      expect(versionBounds!.x).toBeLessThanOrEqual(profileBounds!.x + 1)
      expect(versionBounds!.y).toBeGreaterThan(profileBounds!.y + profileBounds!.height)
    } else {
      expect(versionBounds!.x).toBeGreaterThan(profileBounds!.x + profileBounds!.width)
    }
  } else {
    expect(versionBounds!.y).toBeGreaterThan(profileBounds!.y + profileBounds!.height)
    expect(versionBounds!.y + versionBounds!.height).toBeLessThan(sidebarBounds!.y + sidebarBounds!.height)
  }
})

test('local Admin shortcut signs in directly without password input', async ({ page }) => {
  const mock = await mockSupabase(page, 'admin')
  await page.getByTestId('local-login-admin').click()

  await expect(page.getByRole('button', { name: 'Tài Khoản' })).toBeVisible()
  expect(mock.requests.find((request) => request.path === '/auth/v1/token')?.body).toMatchObject({
    email: 'tuankiet141199@gmail.com',
    password: 'Shopee-Lin-Local-Only-2026',
  })
})

test('local Tester shortcut signs in directly with the Viewer role', async ({ page }) => {
  const mock = await mockSupabase(page, 'viewer')
  await page.getByTestId('local-login-tester').click()

  await expect(page.getByRole('button', { name: 'Tài Khoản' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Đơn Hàng' })).toBeVisible()
  expect(mock.requests.find((request) => request.path === '/auth/v1/token')?.body).toMatchObject({
    email: 'tuankiet141199+lin-test@gmail.com',
    password: 'Shopee-Lin-Local-Only-2026',
  })
})

test('Admin can open account management and viewer does not see it', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')
  await expect(page.getByRole('button', { name: 'Tài Khoản' })).toBeVisible()
  await page.getByRole('button', { name: 'Tài Khoản' }).click()
  await expect(page.getByRole('heading', { name: 'Quản Lý Tài Khoản' })).toBeVisible()
  await expect(page.getByText('Bé Lin Tốc Độ Cao')).toBeVisible()
  await page.getByRole('button', { name: 'Đặt Lại Mật Khẩu' }).click()
  await expect(page.getByRole('dialog', { name: 'Đặt Lại Mật Khẩu' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tạo Liên Kết' })).toBeVisible()
  await page.getByRole('button', { name: 'Tạo Liên Kết' }).click()
  await expect(page.getByLabel('Liên Kết Khôi Phục')).toHaveValue(/test-recovery-token/)
  await expect(page.getByRole('button', { name: 'Sao Chép Liên Kết' })).toBeVisible()
  await expectNoHorizontalOverflow()
})

test('User can update own profile name while email remains read-only', async ({ page }) => {
  const mock = await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')
  await expect(page.locator('.sidebar-profile-role')).toHaveText('Viewer')
  await page.getByRole('button', { name: 'Hồ Sơ' }).click()
  const dialog = page.getByRole('dialog', { name: 'Hồ Sơ' })
  const email = dialog.getByLabel('Email (Chỉ Xem)')
  await expect(email).toHaveValue('viewer@example.test')
  await expect(email).not.toBeEditable()
  await expect(email).toHaveAttribute('readonly')
  await expect(dialog.locator('.required-marker')).toHaveText('*')
  await expect(dialog.getByLabel('Tên Hiển Thị')).toHaveJSProperty('required', true)
  await expectRequiredMarkerInline(dialog.locator('.label-title'))
  await dialog.getByLabel('Tên Hiển Thị').fill('Bé Lin Test UI')
  await dialog.getByRole('button', { name: 'Lưu Thay Đổi' }).click()

  await expect(page.locator('.sidebar-profile-name')).toHaveText('Bé Lin Test UI')
  expect(mock.profiles.find((profile) => profile.id.endsWith('000000000002'))?.full_name).toBe('Bé Lin Test UI')
  expect(mock.requests.find((request) => request.path === '/rest/v1/rpc/update_my_profile')?.body).toEqual({ p_display_name: 'Bé Lin Test UI', p_avatar_path: null })
})

test('Admin profile email is view-only and display name is required', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Hồ Sơ' }).click()

  const dialog = page.getByRole('dialog', { name: 'Hồ Sơ' })
  const email = dialog.getByLabel('Email (Chỉ Xem)')
  await expect(email).toHaveValue('admin@example.test')
  await expect(email).not.toBeEditable()
  await expect(email).toHaveAttribute('readonly')
  await expect(email).toHaveCSS('background-color', 'rgb(247, 246, 245)')
  await expect(dialog.locator('.required-marker')).toHaveText('*')
  await expect(dialog.getByLabel('Tên Hiển Thị')).toHaveJSProperty('required', true)
  await expectRequiredMarkerInline(dialog.locator('.label-title'))
})

test('Profile dialog remains open for inside clicks and closes from the backdrop', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Hồ Sơ' }).click()
  const dialog = page.getByRole('dialog', { name: 'Hồ Sơ' })
  const backdrop = page.locator('.dialog-backdrop')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('heading', { name: 'Hồ Sơ' }).click()
  await expect(dialog).toBeVisible()
  await backdrop.click({ position: { x: 3, y: 3 } })
  await expect(dialog).toHaveCount(0)
})

test('Viewer sees read-only navigation and the payment QR dialog', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')
  await expect(page.getByRole('button', { name: 'Tài Khoản' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Thanh toán' }).click()
  await expect(page.getByRole('dialog', { name: 'Thanh toán' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Mã VietQR thanh toán' })).toHaveAttribute('src', /vietqr\.io\/image\/TPB-0000000000/)
  await expect(page.getByText('Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé.')).toBeVisible()
  await expectNoHorizontalOverflow()
})

test('Viewer can open orders, installments, and reports on responsive layouts', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')

  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await expect(page.getByRole('heading', { name: 'Đơn hàng' })).toBeVisible()
  await expect(page.getByText('Chưa Có Đơn Hàng.')).toBeVisible()
  await expectNoHorizontalOverflow()

  await page.getByRole('button', { name: 'Trả Góp' }).click()
  await expect(page.getByRole('heading', { name: 'Trả Góp' })).toBeVisible()
  await expect(page.getByText('S25 Ultra')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ghi Nhận Lần Góp' })).toHaveCount(0)
  await expectNoHorizontalOverflow()

  await page.getByRole('button', { name: 'Báo Cáo' }).click()
  await expect(page.getByRole('heading', { name: 'Báo cáo kỳ' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Khóa sổ kỳ này' })).toHaveCount(0)
  await expectNoHorizontalOverflow()
})

test('ShopeeLin brand returns to the overview', async ({ page }) => {
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')

  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await page.getByRole('button', { name: 'ShopeeLin — Tổng Quan' }).click()

  await expect(page.getByRole('button', { name: 'Tổng Quan', exact: true })).toHaveClass(/active/)
})

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} sees the correct overview-only role and payment metrics`, async ({ page }) => {
    await mockSupabase(page, role)
    await signIn(page, role)

    const currentCycle = page.locator('.section-card')
    await expect(currentCycle.locator('.overview-cycle-label')).toHaveText('Kỳ Hiện Tại')
    await expect(currentCycle.locator('.overview-cycle-label')).toHaveCSS('color', 'rgb(113, 107, 103)')
    await expect(currentCycle.getByRole('heading', { name: /^\d{2}\.\d{4} \(\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}\)$/ })).toBeVisible()
    await expect(currentCycle.locator('.status-pill')).toHaveCount(0)
    await expect(page.getByText('Tổng đã thanh toán')).toHaveCount(role === 'admin' ? 1 : 0)
    await expect(page.locator('.sidebar-profile-role')).toHaveText(role === 'admin' ? 'Admin' : 'Viewer')
  })
}

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} sees the correct deleted-order filter option when none are deleted`, async ({ page }) => {
    await mockSupabase(page, role, { orders: [] })
    await signIn(page, role)
    await page.getByRole('button', { name: 'Đơn Hàng' }).click()
    await page.locator('.order-filter summary').click()

    await expect(page.getByLabel('Đã Xóa', { exact: true })).toHaveCount(role === 'admin' ? 1 : 0)
  })
}

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} sees the empty installment-plan state`, async ({ page }) => {
    await mockSupabase(page, role, { installmentSummary: [] })
    await signIn(page, role)
    await page.getByRole('button', { name: 'Trả Góp' }).click()

    await expect(page.getByText('Chưa có khoản trả góp.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tạo Khoản Trả Góp' })).toHaveCount(role === 'admin' ? 1 : 0)
  })
}

test('Viewer sees an installment plan with no payment history', async ({ page }) => {
  await mockSupabase(page, 'viewer', {
    installmentSummary: [{ id: 's25-ultra', name: 'S25 Ultra', total_amount: 20_000_000, total_paid: 0 }],
    installmentPayments: [],
  })
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Trả Góp' }).click()

  await expect(page.getByText('S25 Ultra')).toBeVisible()
  await expect(page.getByText('Đã góp 0 ₫ / 20.000.000 ₫')).toBeVisible()
  await expect(page.locator('.payment-history > *')).toHaveCount(0)
})

test('Admin creates an installment plan, rejects an overpayment, and records a contribution', async ({ page }) => {
  const mock = await mockSupabase(page, 'admin', { installmentSummary: [] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Trả Góp' }).click()
  await page.getByRole('button', { name: 'Tạo Khoản Trả Góp' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Tạo Khoản Trả Góp' })
  await createDialog.getByLabel('Tên Khoản').fill('Test S25')
  await createDialog.getByLabel('Tổng Tiền (VND)').fill('10,000')
  await createDialog.getByRole('button', { name: 'Tạo Khoản Trả Góp' }).click()

  const plan = page.locator('.installment-block').filter({ hasText: 'Test S25' })
  await expect(plan.getByText('Đã góp 0 ₫ / 10.000 ₫')).toBeVisible()
  await plan.getByRole('button', { name: 'Ghi Nhận Lần Góp' }).click()
  const paymentDialog = page.getByRole('dialog', { name: 'Ghi Nhận Lần Góp' })
  await paymentDialog.getByLabel('Số Tiền (VND)').fill('10,001')
  const alerts: string[] = []
  page.once('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.dismiss() })
  await paymentDialog.getByRole('button', { name: 'Lưu Lần Góp' }).click()
  await expect.poll(() => alerts[0]).toMatch(/Số tiền góp vượt quá số còn lại 10\.000\s₫\./)
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_installment_payment')).toBe(false)

  await paymentDialog.getByLabel('Số Tiền (VND)').fill('6,000')
  await paymentDialog.getByLabel('Ghi Chú').fill('Lần góp đầu')
  await paymentDialog.getByRole('button', { name: 'Lưu Lần Góp' }).click()
  await expect(plan.getByText('Đã góp 6.000 ₫ / 10.000 ₫')).toBeVisible()
  await expect(plan.getByText('4.000 ₫')).toBeVisible()
  await expect(plan.getByText(/Lần góp đầu/)).toBeVisible()
  expect(mock.installmentPayments).toHaveLength(1)
  expect(mock.installmentSummary.find((item) => item.name === 'Test S25')?.total_paid).toBe(6000)
})

test('Viewer profile avatar upload is private and email is read-only', async ({ page }) => {
  const mock = await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Hồ Sơ' }).click()
  const dialog = page.getByRole('dialog', { name: 'Hồ Sơ' })
  await expect(dialog.getByLabel('Email (Chỉ Xem)')).not.toBeEditable()
  const fileInput = dialog.getByLabel('Chọn ảnh đại diện')

  await fileInput.setInputFiles({ name: 'not-image.pdf', mimeType: 'application/pdf', buffer: Buffer.from('file') })
  await expect(dialog.getByRole('alert')).toHaveText('Chỉ nhận ảnh JPEG, PNG hoặc WebP.')
  expect(mock.requests.some((request) => request.path.startsWith('/storage/v1/object/'))).toBe(false)

  await fileInput.setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })
  await expect(dialog.getByRole('alert')).toHaveText('Ảnh đại diện phải nhỏ hơn hoặc bằng 2 MB.')
  expect(mock.requests.some((request) => request.path.startsWith('/storage/v1/object/'))).toBe(false)

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  await fileInput.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  await expect(dialog.locator('.profile-avatar-image')).toBeVisible()
  await dialog.getByRole('button', { name: 'Lưu Thay Đổi' }).click()

  const profileUpdate = mock.requests.find((request) => request.path === '/rest/v1/rpc/update_my_profile')
  expect(profileUpdate?.body).toMatchObject({ p_display_name: 'Bé Lin Tốc Độ Cao' })
  expect(profileUpdate?.body.p_avatar_path).toMatch(/^00000000-0000-4000-8000-000000000002\/[\w-]+\.png$/)
  expect(mock.profiles.find((profile) => profile.role === 'viewer')?.avatar_path).toBe(profileUpdate?.body.p_avatar_path)
  expect(mock.requests.some((request) => request.method === 'DELETE' && request.path.startsWith('/storage/v1/object/'))).toBe(false)
})

test('successful password setup removes the redirect marker from the URL', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')

  await page.goto('/?set-password=1#')
  await expect(page.getByRole('heading', { name: 'Đặt Mật Khẩu' })).toBeVisible()
  await page.getByLabel('Mật Khẩu Mới').fill('new-test-password')
  await page.getByRole('button', { name: 'Lưu Mật Khẩu' }).click()

  await expect(page.getByRole('button', { name: 'Tổng Quan', exact: true })).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
})

test('Admin creates and edits orders on the 20th/21st cycle boundary', async ({ page }) => {
  const mock = await mockSupabase(page, 'admin', { cycles: [mayCycle, juneCycle, januaryCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  const boundaryCases = [
    { description: 'Order on May 20', date: '2026-05-20', cycleId: mayCycle.id },
    { description: 'Order on May 21', date: '2026-05-21', cycleId: juneCycle.id },
    { description: 'Order on Dec 21', date: '2026-12-21', cycleId: januaryCycle.id },
  ]

  for (const item of boundaryCases) {
    await page.getByRole('button', { name: 'Thêm Đơn' }).click()
    const dialog = page.getByRole('dialog', { name: 'Thêm Đơn Hàng' })
    await dialog.getByLabel('Mô Tả Đơn Hàng').fill(item.description)
    await dialog.getByLabel('Ngày Đặt').fill(item.date)
    await dialog.getByLabel('Số Tiền (VND)').fill('120000')
    await dialog.getByRole('button', { name: 'Lưu Đơn Hàng' }).click()
    await expect(page.getByText(item.description)).toBeVisible()
  }

  const inserted = mock.requests.filter((request) => request.method === 'POST' && request.path === '/rest/v1/orders')
  expect(inserted.map((request) => [request.body.placed_at, request.body.billing_cycle_id])).toEqual([
    ['2026-05-20', mayCycle.id],
    ['2026-05-21', juneCycle.id],
    ['2026-12-21', januaryCycle.id],
  ])

  const mayRow = page.locator('.order-row').filter({ hasText: 'Order on May 20' })
  await mayRow.getByRole('button', { name: 'Sửa Đơn' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Sửa Đơn Hàng' })
  await editDialog.getByLabel('Số Tiền (VND)').fill('135000')
  await editDialog.getByRole('button', { name: 'Lưu Đơn Hàng' }).click()
  await expect(mayRow.getByText('135.000')).toBeVisible()
  const update = mock.requests.find((request) => request.path.endsWith('/update_order'))
  expect(update?.body).toMatchObject({ p_description: 'Order on May 20', p_placed_at: '2026-05-20', p_amount: 135000, p_billing_cycle_id: mayCycle.id })
})

test('Orders table puts selection first, shows cycle after amount, and marks required fields', async ({ page, expectNoHorizontalOverflow }) => {
  const longHistory = Array.from({ length: 24 }, (_, index) => {
    const month = (index % 12) + 1
    const year = index < 12 ? 2025 : 2027
    const label = `${String(month).padStart(2, '0')}.${year}`
    return { id: `cycle-${label}`, label, starts_on: '2025-01-21', ends_on: '2025-02-20', opening_balance: 0, status: 'open' as const }
  })
  const mock = await mockSupabase(page, 'admin', {
    orders: [
      { id: 'order-may-layout', description: 'May layout order', placed_at: '2026-05-19', amount: 1000, status: 'unpaid', billing_cycle_id: mayCycle.id },
      { id: 'order-june-layout', description: 'June layout order', placed_at: '2026-05-22', amount: 2000, status: 'unpaid', billing_cycle_id: juneCycle.id },
    ],
    cycles: [mayCycle, juneCycle, ...longHistory],
  })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  expect(await page.locator('.orders-table thead th').allTextContents()).toEqual(['Chọn', 'Ngày', 'Đơn Hàng', 'Số Tiền', 'Kỳ', 'Trạng Thái', 'Hành Động'])
  const mayRow = page.locator('.order-row').filter({ hasText: 'May layout order' })
  await expect(mayRow.locator('td').nth(0).getByRole('checkbox')).toBeVisible()
  await expect(mayRow.locator('td').nth(1)).toHaveAttribute('data-label', 'Ngày')
  await expect(mayRow.locator('td').nth(3)).toContainText('1.000')
  await expect(mayRow.locator('td').nth(4)).toContainText('05.2026')

  await page.getByRole('button', { name: 'Thêm Đơn' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Thêm Đơn Hàng' })
  await expect(createDialog.locator('.required-marker')).toHaveCount(3)
  const createTitles = createDialog.locator('.label-title')
  await expect(createTitles).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) await expectRequiredMarkerInline(createTitles.nth(index))
  for (const label of ['Mô Tả Đơn Hàng', 'Ngày Đặt', 'Số Tiền (VND)']) await expect(createDialog.getByLabel(label)).toHaveAttribute('required', '')
  await expect(createDialog.getByLabel('Đơn Hàng Shopee (Không Bắt Buộc)')).not.toHaveAttribute('required', '')
  await createDialog.getByRole('button', { name: 'Đóng' }).click()

  await mayRow.getByRole('button', { name: 'Sửa Đơn' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Sửa Đơn Hàng' })
  await expect(editDialog.locator('.required-marker')).toHaveCount(3)
  const editTitles = editDialog.locator('.label-title')
  await expect(editTitles).toHaveCount(3)
  for (let index = 0; index < 3; index += 1) await expectRequiredMarkerInline(editTitles.nth(index))
  for (const label of ['Mô Tả Đơn Hàng', 'Ngày Đặt', 'Số Tiền (VND)']) await expect(editDialog.getByLabel(label)).toHaveAttribute('required', '')
  await expect(editDialog.getByLabel('Đơn Hàng Shopee (Không Bắt Buộc)')).not.toHaveAttribute('required', '')
  await editDialog.getByRole('button', { name: 'Đóng' }).click()

  const orderFilter = page.locator('.order-filter')
  await orderFilter.locator('summary').click()
  await expect(page.locator('.order-filter summary')).toHaveText('Bộ Lọc')
  await expect(page.locator('.filter-chevron')).toHaveCount(1)
  await expect(page.locator('.order-filter-menu')).toHaveCSS('user-select', 'none')
  await page.getByRole('heading', { name: 'Đơn Hàng' }).click()
  await expect(orderFilter).not.toHaveAttribute('open', '')
  await orderFilter.locator('summary').click()
  await page.keyboard.press('Escape')
  await expect(orderFilter).not.toHaveAttribute('open', '')
  await expect(orderFilter.locator('summary')).toBeFocused()
  await orderFilter.locator('summary').click()
  const cycleList = page.locator('.cycle-filter-list')
  expect(await cycleList.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  const cycleOption = page.locator('.cycle-filter-option').filter({ has: page.locator('.cycle-filter-copy strong').getByText('05.2026') }).first()
  await expect(cycleOption).toHaveCSS('user-select', 'none')
  await expect(cycleOption).toHaveAttribute('aria-label', '05.2026 (21/04/2026 – 20/05/2026)')
  await expect(cycleOption.locator('.cycle-filter-copy > span')).toHaveText('21/04/2026 – 20/05/2026')
  expect(await cycleList.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1)
  const cycleSearch = page.getByLabel('Tìm Kỳ Sổ')
  await expect(cycleSearch).toHaveCSS('user-select', 'text')
  await cycleSearch.fill('05.2026')
  await expect(cycleList.locator('.filter-option')).toHaveCount(1)
  await page.getByLabel(/05\.2026 \(21\/04\/2026 – 20\/05\/2026\)/).check()
  await expect(page.locator('.order-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
  await expect(page.locator('.order-row')).toHaveCount(1)
  await expect(page.locator('.order-row').first()).toContainText('May layout order')

  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
  await expectNoHorizontalOverflow()
})

test('Order search applies on Enter or the search button, and filters stage until Apply', async ({ page, expectNoHorizontalOverflow }) => {
  const orders: MockOrder[] = [
    { id: '11111111-1111-4111-8111-111111111111', description: 'Chè dưỡng nhan', placed_at: '2026-05-04', amount: 1000, status: 'unpaid', billing_cycle_id: mayCycle.id },
    { id: 'order-june-paid', description: 'Bánh trung thu', placed_at: '2026-05-22', amount: 2000, status: 'paid', billing_cycle_id: juneCycle.id },
    { id: 'order-june-unpaid', description: 'Trà sen', placed_at: '2026-05-23', amount: 3000, status: 'unpaid', billing_cycle_id: juneCycle.id },
  ]
  const mock = await mockSupabase(page, 'admin', {
    orders,
    cycles: [mayCycle, juneCycle],
    payments: [{ id: 'payment-1', paid_at: '2026-05-25', amount: 2000, note: 'Đã nhận' }],
    allocations: [{ payment_id: 'payment-1', order_id: 'order-june-paid', amount: 2000 }],
  })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  const rows = page.locator('.order-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).not.toContainText(orders[0].id)
  await expect(page.locator('.order-row').filter({ hasText: 'Chè dưỡng nhan' }).locator('td').nth(4)).toHaveText('05.2026')

  const search = page.getByLabel('Tìm Kiếm Đơn Hàng')
  await search.fill('sen')
  await expect(rows).toHaveCount(3)
  await search.press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Trà sen')

  await search.fill('Bánh')
  await page.getByRole('button', { name: 'Tìm Kiếm' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Bánh trung thu')
  await search.fill('')
  await page.getByRole('button', { name: 'Tìm Kiếm' }).click()
  await expect(rows).toHaveCount(3)

  await page.getByText('Bộ Lọc', { exact: true }).click()
  await page.getByLabel(/06\.2026 \(21\/05\/2026 – 20\/06\/2026\)/).check()
  await page.getByLabel('Chưa Trả').check()
  await expect(rows).toHaveCount(3)
  await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Trà sen')
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
  await expectNoHorizontalOverflow()
})

test('Multi-product descriptions split into item rows only when every chunk validates', async ({ page }) => {
  const description = 'Áo tràng Thiên Di Phân loại hàng: Lam,L x1 Áo tràng Thiên Di Phân loại hàng: Lam,M x1 Đồ lam nữ Thiên Di Phân loại hàng: Hồng,S x1'
  const mock = await mockSupabase(page, 'viewer', {
    orders: [
      { id: 'order-items', description, placed_at: '2026-05-02', amount: 484120, status: 'unpaid', billing_cycle_id: mayCycle.id },
      { id: 'order-uncertain', description: 'Box x2 miscellaneous note x1', placed_at: '2026-05-01', amount: 100, status: 'unpaid', billing_cycle_id: mayCycle.id },
    ],
    cycles: [mayCycle],
  })
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  const sampleRow = page.locator('.order-row').filter({ hasText: 'Áo tràng Thiên Di' })
  await expect(sampleRow.locator('.order-item-lines > span')).toHaveCount(3)
  const uncertainRow = page.locator('.order-row').filter({ hasText: 'Box x2 miscellaneous note x1' })
  await expect(uncertainRow.locator('.order-item-lines > span')).toHaveCount(1)
  await expect(sampleRow.getByRole('button', { name: 'Xem Đơn' })).toHaveCount(0)
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
})

test('Shopee Eye link is validated, safe to open, and disabled when absent', async ({ page }) => {
  await mockSupabase(page, 'admin', {
    orders: [
      { id: 'order-link', description: 'Linked order', placed_at: '2026-05-01', amount: 1000, status: 'unpaid', billing_cycle_id: mayCycle.id, shopee_order_url: 'https://shopee.vn/user/purchase/order/123456789' },
      { id: 'order-no-link', description: 'Unlinked order', placed_at: '2026-05-02', amount: 2000, status: 'unpaid', billing_cycle_id: mayCycle.id, shopee_order_url: 'https://evil.example/user/purchase/order/123456789' },
    ],
    cycles: [mayCycle],
  })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  const linked = page.locator('.order-row').filter({ hasText: 'Linked order' }).getByRole('link', { name: 'Xem Đơn Trên Shopee' })
  await expect(linked).toHaveAttribute('href', 'https://shopee.vn/user/purchase/order/123456789')
  await expect(linked).toHaveAttribute('target', '_blank')
  await expect(linked).toHaveAttribute('rel', /noopener noreferrer/)
  const noLink = page.locator('.order-row').filter({ hasText: 'Unlinked order' }).locator('a[aria-disabled="true"]')
  await expect(noLink).toHaveAttribute('aria-disabled', 'true')
  await expect(noLink).not.toHaveAttribute('href', /https:\/\/evil\.example/)
})

test('Admin allocates one partial payment across multiple orders and rejects excess payment', async ({ page }) => {
  const cycle = { ...mayCycle }
  const orders: MockOrder[] = [
    { id: 'order-first', description: 'First order', placed_at: '2026-05-02', amount: 1000, status: 'unpaid', billing_cycle_id: cycle.id },
    { id: 'order-second', description: 'Second order', placed_at: '2026-05-03', amount: 2000, status: 'unpaid', billing_cycle_id: cycle.id },
  ]
  const mock = await mockSupabase(page, 'admin', { orders, cycles: [cycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await page.getByLabel('Chọn First order').check()
  await page.getByLabel('Chọn Second order').check()

  page.once('dialog', async (dialog) => await dialog.accept('2,200'))
  await page.getByRole('button', { name: 'Ghi Nhận Khoản Đã Nhận' }).click()

  await expect(page.locator('.order-row').filter({ hasText: 'First order' }).getByText('Đã Trả')).toBeVisible()
  const secondRow = page.locator('.order-row').filter({ hasText: 'Second order' })
  await expect(secondRow.getByText('Trả Một Phần')).toBeVisible()
  await expect(secondRow.getByText(/Còn/)).toBeVisible()
  const paymentRequest = mock.requests.find((request) => request.path === '/rest/v1/rpc/record_order_payment')
  expect(paymentRequest?.body).toMatchObject({ p_order_ids: expect.arrayContaining(['order-first', 'order-second']), p_amount: 2200, p_note: 'Admin xác nhận thanh toán' })
  expect(mock.payments).toHaveLength(1)
  expect(mock.allocations.map((allocation) => [allocation.order_id, allocation.amount])).toEqual([['order-first', 1000], ['order-second', 1200]])

  await page.getByLabel('Chọn Second order').check()
  const dialogTypes: string[] = []
  const acceptDialogs = async (dialog: import('@playwright/test').Dialog) => {
    dialogTypes.push(dialog.type())
    await dialog.accept(dialog.type() === 'prompt' ? '900' : undefined)
  }
  page.on('dialog', acceptDialogs)
  await page.getByRole('button', { name: 'Ghi Nhận Khoản Đã Nhận' }).click()
  await expect.poll(() => dialogTypes).toEqual(['prompt', 'alert'])
  page.off('dialog', acceptDialogs)
  await expect(secondRow.getByText('Trả Một Phần')).toBeVisible()
  expect(mock.payments).toHaveLength(1)
})

test('Paid orders cannot be selected for a second payment and allocated order finance fields are locked', async ({ page }) => {
  const paid: MockOrder = { id: 'order-paid-eligibility', description: 'Paid', placed_at: '2026-05-02', amount: 5000, status: 'paid', billing_cycle_id: mayCycle.id }
  const partial: MockOrder = { id: 'order-partial-eligibility', description: 'Partial', placed_at: '2026-05-03', amount: 9000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const mock = await mockSupabase(page, 'admin', {
    orders: [paid, partial], cycles: [mayCycle],
    payments: [{ id: 'payment-prior', paid_at: '2026-05-04', amount: 5000, note: null }],
    allocations: [{ payment_id: 'payment-prior', order_id: paid.id, amount: 5000 }, { payment_id: 'payment-prior', order_id: partial.id, amount: 3000 }],
  })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  const paidRow = page.locator('.order-row').filter({ hasText: 'Paid' })
  const partialRow = page.locator('.order-row').filter({ hasText: 'Partial' })
  await expect(paidRow.getByRole('checkbox')).toHaveCount(0)
  await expect(partialRow.getByRole('checkbox')).toHaveCount(1)

  await partialRow.getByRole('button', { name: 'Sửa Đơn' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sửa Đơn Hàng' })
  await expect(dialog.getByLabel('Ngày Đặt')).toBeDisabled()
  await expect(dialog.getByLabel('Số Tiền (VND)')).toBeDisabled()
  await dialog.getByLabel('Mô Tả Đơn Hàng').fill('Partial corrected description')
  await dialog.getByRole('button', { name: 'Lưu Đơn Hàng' }).click()
  await expect(page.locator('.order-row').filter({ hasText: 'Partial corrected description' })).toContainText('9.000 ₫')
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
})

test('Admin cancels a paid order and records a refund adjustment', async ({ page }) => {
  const order: MockOrder = { id: 'order-paid', description: 'Refunded order', placed_at: '2026-05-02', amount: 5000, status: 'paid', billing_cycle_id: mayCycle.id }
  const payment = { id: 'payment-existing', paid_at: '2026-05-04', amount: 5000, note: null }
  const allocation = { payment_id: payment.id, order_id: order.id, amount: 5000 }
  const mock = await mockSupabase(page, 'admin', { orders: [order], cycles: [mayCycle], payments: [payment], allocations: [allocation] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  const dialogTypes: string[] = []
  const acceptDialogs = async (dialog: import('@playwright/test').Dialog) => {
    dialogTypes.push(dialog.type())
    await dialog.accept(dialog.type() === 'prompt' ? '4500' : undefined)
  }
  page.on('dialog', acceptDialogs)
  await page.locator('.order-row').filter({ hasText: 'Refunded order' }).getByRole('button', { name: 'Hủy Đơn' }).click()
  await expect.poll(() => dialogTypes).toEqual(['confirm', 'prompt'])
  page.off('dialog', acceptDialogs)

  await expect(page.locator('.order-row').filter({ hasText: 'Refunded order' }).getByText('Đã Hủy')).toBeVisible()
  const cancelRequest = mock.requests.find((request) => request.path === '/rest/v1/rpc/cancel_order')
  expect(cancelRequest?.body).toMatchObject({ p_order_id: order.id, p_refund_amount: 4500, p_note: 'Hoàn tiền đơn Refunded order' })
  expect(mock.ledgerEntries).toHaveLength(1)
  expect(mock.ledgerEntries[0]).toMatchObject({ kind: 'refund', amount: 4500, billing_cycle_id: mayCycle.id })
})

test('Admin soft-deletes an unpaid order and restores its retained history', async ({ page }) => {
  const order: MockOrder = { id: 'order-delete', description: 'Unpaid test order', placed_at: '2026-05-02', amount: 9000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const activeOrder: MockOrder = { id: 'order-stays', description: 'Still owed order', placed_at: '2026-05-03', amount: 3000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const mock = await mockSupabase(page, 'admin', { orders: [order, activeOrder], cycles: [mayCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    await dialog.accept()
  })
  const row = page.locator('.order-row').filter({ hasText: 'Unpaid test order' })
  await row.getByRole('button', { name: 'Xóa Đơn' }).click()
  await expect(row.getByText('Đã Xóa')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Sửa Đơn' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Xóa Đơn' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Khôi Phục Đơn' })).toBeVisible()
  expect(row).toHaveClass(/is-deleted/)
  expect(mock.orders).toHaveLength(2)
  await page.getByRole('button', { name: 'ShopeeLin — Tổng Quan' }).click()
  await expect(page.getByText('Dư nợ Shopee hiện tại').locator('..').getByText('3.000 ₫')).toBeVisible()
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  const deletedRow = page.locator('.order-row').filter({ hasText: 'Unpaid test order' })
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/soft_delete_order' && request.body.p_order_id === order.id)).toBe(true)
  expect(mock.requests.some((request) => request.method === 'DELETE')).toBe(false)

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    await dialog.accept()
  })
  await deletedRow.getByRole('button', { name: 'Khôi Phục Đơn' }).click()
  await expect(row.getByText('Chưa Trả')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Sửa Đơn' })).toBeVisible()
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/restore_deleted_order' && request.body.p_order_id === order.id)).toBe(true)
  expect(mock.requests.some((request) => request.method === 'DELETE')).toBe(false)
})

test('Admin exports the selected cycle as an Excel-compatible report', async ({ page }) => {
  const order: MockOrder = { id: 'order-may', description: 'May report item', placed_at: '2026-05-19', amount: 250000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const payment = { id: 'payment-may', paid_at: '2026-05-20', amount: 75000, note: 'Bé Lin chuyển khoản' }
  const mock = await mockSupabase(page, 'admin', { orders: [order], cycles: [mayCycle, juneCycle], payments: [payment] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Báo Cáo' }).click()
  await page.getByLabel('Kỳ sổ').selectOption(mayCycle.id)
  await expect(page.getByLabel('Kỳ sổ').locator('option:checked')).toContainText('05.2026 (21/04/2026 – 20/05/2026)')

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

test('Admin closes a cycle with a balance snapshot and reopens it restoring the next opening balance', async ({ page, expectNoHorizontalOverflow }) => {
  const may: MockCycle = { ...mayCycle, opening_balance: 100_000 }
  const june: MockCycle = { ...juneCycle, opening_balance: 42_000 }
  const order: MockOrder = { id: 'order-close-may', description: 'May close test order', placed_at: '2026-05-19', amount: 250_000, status: 'unpaid', billing_cycle_id: may.id }
  const payment = { id: 'payment-close-may', paid_at: '2026-05-20', amount: 75_000, note: 'Test payment' }
  const mock = await mockSupabase(page, 'admin', { orders: [order], cycles: [may, june], payments: [payment] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Báo Cáo' }).click()
  await page.getByLabel('Kỳ sổ').selectOption(may.id)
  await expectNoHorizontalOverflow()

  await expect(page.getByText('Còn lại theo kỳ').locator('..').getByText('275.000 ₫')).toBeVisible()
  await page.getByRole('button', { name: 'Khóa sổ kỳ này' }).click()

  await expect(page.getByRole('button', { name: 'Mở khóa kỳ' })).toBeVisible()
  await expect(page.getByText('Kỳ đã khóa. Báo cáo đọc số dư đã lưu tại thời điểm khóa.')).toBeVisible()
  await expect(page.getByText('Còn lại theo kỳ').locator('..').getByText('275.000 ₫')).toBeVisible()
  expect(mock.requests.find((request) => request.path === '/rest/v1/rpc/close_billing_cycle')?.body).toEqual({ p_cycle_id: may.id })
  expect(mock.closings).toEqual([{
    billing_cycle_id: may.id,
    opening_balance: 100_000,
    purchase_total: 250_000,
    payment_total: 75_000,
    adjustment_total: 0,
    closing_balance: 275_000,
    next_opening_before: 42_000,
  }])
  expect(mock.cycles.find((cycle) => cycle.id === june.id)?.opening_balance).toBe(275_000)
  await page.getByLabel('Kỳ sổ').selectOption(june.id)
  await expect(page.getByText('Dư đầu kỳ').locator('..').getByText('275.000 ₫')).toBeVisible()
  await page.getByLabel('Kỳ sổ').selectOption(may.id)

  await page.getByRole('button', { name: 'Mở khóa kỳ' }).click()
  await expect(page.getByRole('button', { name: 'Khóa sổ kỳ này' })).toBeVisible()
  await expect(page.getByText('Kỳ đã khóa. Báo cáo đọc số dư đã lưu tại thời điểm khóa.')).toHaveCount(0)
  expect(mock.requests.find((request) => request.path === '/rest/v1/rpc/reopen_billing_cycle')?.body).toEqual({ p_cycle_id: may.id })
  expect(mock.closings).toHaveLength(0)

  await page.getByLabel('Kỳ sổ').selectOption(june.id)
  await expect(page.getByText('Dư đầu kỳ').locator('..').getByText('42.000 ₫')).toBeVisible()
  await expectNoHorizontalOverflow()
})

test('Print report action invokes print and print media hides app navigation/actions', async ({ page }) => {
  await mockSupabase(page, 'admin', { cycles: [mayCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Báo Cáo' }).click()
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
