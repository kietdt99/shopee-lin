import { test, expect, mockSupabase, signIn } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import type { MockCycle, MockOrder } from './fixtures'

function contrastRatio(first: string, second: string) {
  const luminance = (color: string) => {
    const rgb = color.match(/\d+/g)?.slice(0, 3).map(Number)
    if (!rgb || rgb.length !== 3) throw new Error(`Cannot parse computed RGB color: ${color}`)
    const channels = rgb.map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

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

async function orderDateLabelGap(dateCell: Locator) {
  return dateCell.evaluate((cell) => {
    const labelStyle = getComputedStyle(cell, '::before')
    const label = labelStyle.content.replace(/^['"]|['"]$/g, '')
    const textNode = Array.from(cell.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    if (!textNode) return Number.NEGATIVE_INFINITY

    const range = document.createRange()
    range.selectNodeContents(textNode)
    const valueLeft = range.getBoundingClientRect().left
    const cellLeft = cell.getBoundingClientRect().left
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return Number.NEGATIVE_INFINITY
    context.font = `${labelStyle.fontWeight} ${labelStyle.fontSize} ${labelStyle.fontFamily}`
    return valueLeft - cellLeft - context.measureText(label).width
  })
}

async function applyAllOrderCycles(page: Page) {
  await page.locator('.cycle-filter-select > summary').click()
  await page.getByRole('checkbox', { name: 'Chọn Tất Cả Kỳ' }).check()
  await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
}

async function waitForAnimationsToFinish(page: Page) {
  await page.locator('.cycle-filter-select .filter-select-menu').evaluate(async (menu) => {
    await Promise.all(menu.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  })
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

test('target desktop, laptop, and Samsung viewports use the expected content frame', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'admin')
  await signIn(page, 'admin')

  const shell = page.locator('.app-shell')
  const targets = [
    { name: 'Desktop 2K 27-inch', width: 2560, height: 1440, expectedShellWidth: 2048 },
    { name: 'Laptop 14-inch', width: 1366, height: 768, expectedShellWidth: 1366 },
    { name: 'Samsung S23 Ultra CSS viewport', width: 384, height: 854, expectedShellWidth: 384 },
    { name: 'Samsung S25 Ultra CSS viewport', width: 384, height: 854, expectedShellWidth: 384 },
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
  const version = sidebar.getByText('v0.1.2')
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
  const nameColor = await profileName.evaluate((name) => getComputedStyle(name).color)
  expect(roleStyling.color).not.toBe(nameColor)
  expect(roleStyling.color).toBe('rgb(107, 98, 94)')
  const profileCardBackground = await profile.evaluate((card) => getComputedStyle(card).backgroundColor)
  expect(contrastRatio(roleStyling.color, profileCardBackground)).toBeGreaterThanOrEqual(4.5)
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
  const email = dialog.getByLabel('Email')
  await expect(email).toHaveValue('viewer@example.test')
  await expect(email).not.toBeEditable()
  await expect(email).toHaveAttribute('readonly')
  await expect(email).toHaveCSS('background-color', 'rgb(247, 246, 245)')
  await expect(dialog.getByText('Email (Chỉ Xem)')).toHaveCount(0)
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
  const email = dialog.getByLabel('Email')
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

test('Viewer cannot open payment settings and sees only the QR image and saved note', async ({ page, expectNoHorizontalOverflow }) => {
  const note = 'Chuyển khoản xong nhớ nhắn bé Kịt nhé 😘'
  await mockSupabase(page, 'viewer', { paymentSettings: { singleton: true, note, qr_image_path: 'admin/payment-qr.svg', updated_at: '', updated_by: null } })
  await page.goto('/?tab=payment-settings')
  await signIn(page, 'viewer')
  await expect(page.getByRole('button', { name: 'Tài Khoản' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Thanh Toán', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.search === '' && url.hash === '')
  await page.getByRole('button', { name: 'Thanh toán' }).click()
  const paymentDialog = page.getByRole('dialog', { name: 'Thanh toán' })
  await expect(paymentDialog).toBeVisible()
  const qrImage = paymentDialog.getByRole('img', { name: 'Ảnh QR thanh toán' })
  await expect(qrImage).toBeVisible()
  await expect(qrImage).toHaveAttribute('src', /storage\/v1\/object\/sign\/payment-qr/)
  await expect(paymentDialog.locator('img')).toHaveCount(1)
  await expect(paymentDialog.locator('.payment-note')).toHaveText(note)
  await expect(paymentDialog.getByText('Bé Kịt Thần Kỳ')).toHaveCount(0)
  await expect(paymentDialog.getByText(/TPB|0389 2649 401/)).toHaveCount(0)
  await expectNoHorizontalOverflow()
})

test('Admin can upload a payment image and save a trimmed note that Viewer sees', async ({ page, browser }) => {
  const mock = await mockSupabase(page, 'admin')
  await signIn(page, 'admin')
  const settingsTab = page.getByRole('button', { name: 'Thanh Toán', exact: true })
  await expect(settingsTab).toBeVisible()
  await settingsTab.click()
  await expect(page.getByRole('heading', { name: 'Thiết Lập Thanh Toán' })).toBeVisible()
  const existingImage = page.getByRole('img', { name: 'Xem trước ảnh QR thanh toán' })
  const existingImageSrc = await existingImage.getAttribute('src')

  const updatedNote = 'Sau khi chuyển khoản, nhắn bé Kịt để xác nhận nhé 😘'
  await page.getByLabel('Ghi Chú Thanh Toán').fill(`  ${updatedNote}  `)
  const pngDataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ee4d2d'
    context.fillRect(0, 0, 128, 128)
    return canvas.toDataURL('image/png')
  })
  await page.getByLabel('Ảnh QR Thanh Toán').setInputFiles({
    name: 'payment-qr.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngDataUrl.split(',')[1], 'base64'),
  })
  await expect(page.getByRole('img', { name: 'Xem trước ảnh QR thanh toán' })).toBeVisible()
  const saveButton = page.getByRole('button', { name: 'Lưu Thay Đổi' })
  await saveButton.click()
  await expect(saveButton).toHaveText('Lưu Thay Đổi')

  const update = mock.requests.find((request) => request.path === '/rest/v1/rpc/update_payment_settings')
  expect(update).toBeDefined()
  expect(update?.body.p_note).toBe(updatedNote)
  expect(update?.body.p_qr_image_path).toMatch(/^00000000-0000-4000-8000-000000000001\/[\w-]+\.png$/)
  expect(mock.requests.some((request) => request.method === 'POST' && request.path.includes('/object/payment-qr/'))).toBe(true)
  expect(mock.paymentSettings.note).toBe(updatedNote)
  expect(mock.paymentSettings.qr_image_path).toBe(update?.body.p_qr_image_path)

  const viewerContext = await browser.newContext({ viewport: page.viewportSize() ?? undefined })
  const viewerPage = await viewerContext.newPage()
  await mockSupabase(viewerPage, 'viewer', { paymentSettings: mock.paymentSettings })
  await viewerPage.goto('/')
  await signIn(viewerPage, 'viewer')
  await viewerPage.getByRole('button', { name: 'Thanh toán' }).click()
  await expect(viewerPage.locator('.payment-note')).toHaveText(updatedNote)
  await viewerContext.close()
})

test('Admin payment settings reject unsupported and oversized image files before upload', async ({ page }) => {
  const mock = await mockSupabase(page, 'admin')
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Thanh Toán', exact: true }).click()
  const imageInput = page.getByLabel('Ảnh QR Thanh Toán')
  const existingImage = page.getByRole('img', { name: 'Xem trước ảnh QR thanh toán' })
  const existingImageSrc = await existingImage.getAttribute('src')

  await imageInput.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await expect(page.getByRole('alert')).toHaveText('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.')
  await expect(existingImage).toHaveAttribute('src', existingImageSrc!)

  await imageInput.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })
  await expect(page.getByRole('alert')).toHaveText('Ảnh QR không được vượt quá 2 MB.')
  await expect(existingImage).toHaveAttribute('src', existingImageSrc!)
  expect(mock.requests.some((request) => request.method === 'POST' && request.path.includes('/object/payment-qr/'))).toBe(false)
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

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} sees only its supported Orders action column`, async ({ page }) => {
    const order: MockOrder = { id: `order-actions-${role}`, description: 'Action column order', placed_at: '2026-05-10', amount: 12_000, status: 'unpaid', billing_cycle_id: mayCycle.id }
    await mockSupabase(page, role, { orders: [order], cycles: [mayCycle] })
    await signIn(page, role)
    await page.getByRole('button', { name: 'Đơn Hàng' }).click()

    const actionHeaders = page.getByRole('columnheader', { name: 'Hành Động', exact: true })
    const actionCells = page.locator('.order-row [data-label="Hành Động"]')
    if (role === 'admin') {
      await expect(actionHeaders).toHaveCount(1)
      await expect(actionCells).toHaveCount(1)
      await expect(actionCells.getByRole('button', { name: 'Sửa Đơn' })).toBeVisible()
    } else {
      await expect(actionHeaders).toHaveCount(0)
      await expect(actionCells).toHaveCount(0)
    }
  })
}

test('ShopeeLin brand returns to the overview', async ({ page }) => {
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')

  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await page.getByRole('button', { name: 'ShopeeLin', exact: true }).click()

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
    await expect(page.getByText('Tổng đã thanh toán')).toHaveCount(0)
    await expect(page.locator('.sidebar-profile-role')).toHaveText(role === 'admin' ? 'Admin' : 'Viewer')
  })
}

test('Viewer overview payment action aligns responsively without overflow or overlap', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'viewer')
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Tổng Quan' }).click()
  await expectNoHorizontalOverflow()

  const card = page.locator('.balance-card')
  const paymentAction = card.getByRole('button', { name: 'Thanh toán' })
  await expect(paymentAction).toBeVisible()
  const layout = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.balance-card')!
    const button = card.querySelector<HTMLElement>('.light-button')!
    const description = card.querySelector<HTMLElement>(':scope > span')!
    const rect = (element: Element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }
    return {
      viewportWidth: window.innerWidth,
      card: rect(card),
      description: rect(description),
      text: Array.from(card.querySelectorAll<HTMLElement>(':scope > p, :scope > strong, :scope > span')).map(rect),
      button: rect(button),
      buttonGridColumn: getComputedStyle(button).gridColumnStart,
      buttonJustifySelf: getComputedStyle(button).justifySelf,
    }
  })

  expect(layout.button.left).toBeGreaterThanOrEqual(layout.card.left)
  expect(layout.button.right).toBeLessThanOrEqual(layout.card.right)
  const overlapsText = layout.text.some((text) => layout.button.left < text.right
    && layout.button.right > text.left
    && layout.button.top < text.bottom
    && layout.button.bottom > text.top)
  expect(overlapsText).toBe(false)

  if (layout.viewportWidth <= 600) {
    expect(layout.buttonGridColumn).toBe('1')
    expect(layout.buttonJustifySelf).toBe('start')
    expect(layout.button.top).toBeGreaterThanOrEqual(layout.description.bottom)
    expect(Math.abs(layout.button.left - layout.description.left)).toBeLessThanOrEqual(1)
  } else {
    expect(layout.buttonGridColumn).toBe('2')
    expect(layout.buttonJustifySelf).toBe('end')
    expect(layout.button.left).toBeGreaterThan(layout.card.left + layout.card.width / 2)
  }
})

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} sees the correct deleted-order filter option when none are deleted`, async ({ page }) => {
    await mockSupabase(page, role, { orders: [] })
    await signIn(page, role)
    await page.getByRole('button', { name: 'Đơn Hàng' }).click()
    await page.locator('.status-filter-select > summary').click()

    await expect(page.getByRole('checkbox', { name: 'Đã Xóa', exact: true })).toHaveCount(role === 'admin' ? 1 : 0)
  })
}

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} defaults to the newest cycle and can clear to all while status stays unchecked`, async ({ page, expectNoHorizontalOverflow }) => {
    const orders: MockOrder[] = [
      { id: 'filter-may', description: 'May unpaid filter order', placed_at: '2026-05-10', amount: 1000, status: 'unpaid', billing_cycle_id: mayCycle.id },
      { id: 'filter-june', description: 'June paid filter order', placed_at: '2026-05-22', amount: 2000, status: 'paid', billing_cycle_id: juneCycle.id },
    ]
    await mockSupabase(page, role, { orders, cycles: [mayCycle, juneCycle] })
    await signIn(page, role)
    await page.getByRole('button', { name: 'Đơn Hàng' }).click()
    const rows = page.locator('.order-row')
    const cycleTrigger = page.locator('.cycle-filter-select > summary')
    const statusTrigger = page.locator('.status-filter-select > summary')
    await expect(cycleTrigger).toContainText('06.2026')
    await expect(statusTrigger).toContainText('Tất Cả')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('June paid filter order')
    await expect(rows.filter({ hasText: 'May unpaid filter order' })).toHaveCount(0)

    await cycleTrigger.click()
    await waitForAnimationsToFinish(page)
    const allCycles = page.getByRole('checkbox', { name: 'Chọn Tất Cả Kỳ' })
    const mayCycleOption = page.getByLabel('05.2026 (21/04/2026 – 20/05/2026)')
    const juneCycleOption = page.getByLabel('06.2026 (21/05/2026 – 20/06/2026)')
    await expect(allCycles).not.toBeChecked()
    await expect(mayCycleOption).not.toBeChecked()
    await expect(juneCycleOption).toBeChecked()
    const optionLayout = await juneCycleOption.evaluate((option) => {
      const row = option.getBoundingClientRect()
      const checkbox = option.querySelector('input')!.getBoundingClientRect()
      const copy = option.querySelector('.cycle-filter-copy')!.getBoundingClientRect()
      const list = option.closest('.cycle-filter-list')!.getBoundingClientRect()
      return {
        row: { left: row.left, right: row.right, height: row.height },
        checkboxCenter: checkbox.top + checkbox.height / 2,
        copyCenter: copy.top + copy.height / 2,
        list: { left: list.left, right: list.right },
      }
    })
    expect(optionLayout.row.height).toBeGreaterThanOrEqual(48)
    expect(Math.abs(optionLayout.checkboxCenter - optionLayout.copyCenter)).toBeLessThanOrEqual(1)
    expect(optionLayout.row.left).toBeGreaterThanOrEqual(optionLayout.list.left - 1)
    expect(optionLayout.row.right).toBeLessThanOrEqual(optionLayout.list.right + 1)
    await cycleTrigger.click()

    await statusTrigger.click()
    const allStatuses = page.getByRole('checkbox', { name: 'Chọn Tất Cả Trạng Thái' })
    const unpaidStatus = page.getByRole('checkbox', { name: 'Chưa Thanh Toán', exact: true })
    const paidStatus = page.getByRole('checkbox', { name: 'Đã Thanh Toán', exact: true })
    await expect(allStatuses).not.toBeChecked()
    await expect(unpaidStatus).not.toBeChecked()
    await expect(paidStatus).not.toBeChecked()
    if (role === 'admin') await expect(page.getByRole('checkbox', { name: 'Đã Xóa', exact: true })).not.toBeChecked()
    await statusTrigger.click()

    await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('June paid filter order')

    await cycleTrigger.click()
    await juneCycleOption.uncheck()
    await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
    await expect(rows).toHaveCount(2)
    await expect(rows.filter({ hasText: 'May unpaid filter order' })).toBeVisible()
    await expect(rows.filter({ hasText: 'June paid filter order' })).toBeVisible()
    await expect(cycleTrigger).toContainText('Tất Cả')
    await expect(statusTrigger).toContainText('Tất Cả')

    await cycleTrigger.click()
    await expect(allCycles).not.toBeChecked()
    await expect(mayCycleOption).not.toBeChecked()
    await expect(juneCycleOption).not.toBeChecked()
    await cycleTrigger.click()

    await statusTrigger.click()
    await expect(allStatuses).not.toBeChecked()
    await expect(unpaidStatus).not.toBeChecked()
    await expect(paidStatus).not.toBeChecked()
    if (role === 'admin') await expect(page.getByRole('checkbox', { name: 'Đã Xóa', exact: true })).not.toBeChecked()
    await expectNoHorizontalOverflow()
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

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} unpaid-order status badge fits inside its status cell`, async ({ page }) => {
    const order: MockOrder = {
      id: `status-fit-${role}`,
      description: 'Status badge containment order',
      placed_at: '2026-05-10',
      amount: 1000,
      status: 'unpaid',
      billing_cycle_id: mayCycle.id,
    }
    await mockSupabase(page, role, { orders: [order], cycles: [mayCycle] })
    await signIn(page, role)
    await page.getByRole('button', { name: 'Đơn Hàng' }).click()

    const assertBadgeContained = async () => {
      const badge = page.locator('.status-cell .order-status')
      await expect(badge).toHaveText('Chưa Thanh Toán')
      const bounds = await badge.evaluate((element) => {
        const badgeRect = element.getBoundingClientRect()
        const cellRect = element.closest('td')!.getBoundingClientRect()
        const tableRect = element.closest('.orders-table')!.getBoundingClientRect()
        const cardRect = element.closest('.orders-list')!.getBoundingClientRect()
        return {
          badge: { left: badgeRect.left, right: badgeRect.right },
          cell: { left: cellRect.left, right: cellRect.right },
          tableRight: tableRect.right,
          cardRight: cardRect.right,
        }
      })
      expect(bounds.badge.left).toBeGreaterThanOrEqual(bounds.cell.left - 1)
      expect(bounds.badge.right).toBeLessThanOrEqual(bounds.cell.right + 1)
      expect(bounds.badge.right).toBeLessThanOrEqual(bounds.tableRight + 1)
      expect(bounds.badge.right).toBeLessThanOrEqual(bounds.cardRight + 1)
    }

    await assertBadgeContained()
    if ((page.viewportSize()?.width ?? 0) > 900) {
      await page.setViewportSize({ width: 2560, height: 1440 })
      await assertBadgeContained()
    }
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

test('Admin creates an installment plan, rejects overpayment in the dialog, and records a contribution', async ({ page }) => {
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
  await paymentDialog.getByRole('button', { name: 'Lưu Lần Góp' }).click()
  await expect(paymentDialog.getByRole('alert')).toHaveText('Số tiền góp vượt quá số còn lại 10.000 ₫.')
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
  await expect(dialog.getByLabel('Email')).not.toBeEditable()
  await expect(dialog.getByText('Email (Chỉ Xem)')).toHaveCount(0)
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
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.search === '' && url.hash === '')
})

test('Admin creates and edits orders on the 20th/21st cycle boundary', async ({ page }) => {
  const mock = await mockSupabase(page, 'admin', { cycles: [mayCycle, juneCycle, januaryCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await applyAllOrderCycles(page)

  const boundaryCases = [
    { description: 'Order on May 20', date: '2026-05-20', cycleId: mayCycle.id },
    { description: 'Order on May 21', date: '2026-05-21', cycleId: juneCycle.id },
    { description: 'Order on Dec 21', date: '2026-12-21', cycleId: januaryCycle.id },
  ]

  for (const item of boundaryCases) {
    await page.getByRole('button', { name: 'Thêm Đơn Hàng' }).click()
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
  await applyAllOrderCycles(page)

  expect(await page.locator('.orders-table thead th').allTextContents()).toEqual(['Chọn', 'Ngày', 'Đơn Hàng', 'Số Tiền', 'Kỳ', 'Trạng Thái', 'Hành Động'])
  const mayRow = page.locator('.order-row').filter({ hasText: 'May layout order' })
  await expect(mayRow.locator('td').nth(0).getByRole('checkbox')).toBeVisible()
  await expect(mayRow.locator('td').nth(1)).toHaveAttribute('data-label', 'Ngày')
  await expect(mayRow.locator('td').nth(3)).toContainText('1.000')
  await expect(mayRow.locator('td').nth(4)).toContainText('05.2026')

  const originalViewport = page.viewportSize()!
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 800 : 844 })
    await waitForAnimationsToFinish(page)
    expect(await orderDateLabelGap(mayRow.locator('td[data-label="Ngày"]')), `date label gap at ${width}px`).toBeGreaterThanOrEqual(2)
    await expectNoHorizontalOverflow()
  }
  await page.setViewportSize(originalViewport)

  await page.getByRole('button', { name: 'Thêm Đơn Hàng' }).click()
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

  const cycleFilter = page.locator('.cycle-filter-select > summary')
  const cycleFilterDetails = page.locator('.cycle-filter-select')
  await cycleFilter.click()
  await expect(cycleFilterDetails).toHaveAttribute('open', '')
  await expect(page.locator('.filter-select-menu').first()).toHaveCSS('user-select', 'none')
  await page.getByRole('heading', { name: 'Đơn Hàng' }).click()
  await expect(cycleFilterDetails).not.toHaveAttribute('open', '')
  await cycleFilter.click()
  await page.keyboard.press('Escape')
  await expect(cycleFilterDetails).not.toHaveAttribute('open', '')
  await expect(cycleFilter).toBeFocused()
  await cycleFilter.click()
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
  await page.getByRole('checkbox', { name: 'Chọn Tất Cả Kỳ' }).uncheck()
  await page.getByLabel(/05\.2026 \(21\/04\/2026 – 20\/05\/2026\)/).check()
  await expect(page.locator('.order-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
  await expect(page.locator('.order-row')).toHaveCount(1)
  await expect(page.locator('.order-row').first()).toContainText('May layout order')

  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
  await expectNoHorizontalOverflow()
})

test('reduced motion disables nonessential filter and dialog animations and transitions', async ({ page }) => {
  await mockSupabase(page, 'admin', { cycles: [mayCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await applyAllOrderCycles(page)

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const cycleTrigger = page.locator('.cycle-filter-select > summary')
  await cycleTrigger.click()
  const filterMenu = page.locator('.cycle-filter-select .filter-select-menu')
  await expect(filterMenu).toBeVisible()
  const regularMotion = await filterMenu.evaluate((element) => ({
    animation: getComputedStyle(element).animationDuration,
    transition: getComputedStyle(element).transitionDuration,
  }))
  expect(parseFloat(regularMotion.animation)).toBeGreaterThan(0.01)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedMotion = await filterMenu.evaluate((element) => ({
    animation: getComputedStyle(element).animationDuration,
    transition: getComputedStyle(element).transitionDuration,
  }))
  expect(parseFloat(reducedMotion.animation)).toBeLessThanOrEqual(0.00002)
  expect(parseFloat(reducedMotion.transition)).toBeLessThanOrEqual(0.00002)

  await cycleTrigger.click()
  await page.getByRole('button', { name: 'Thêm Đơn Hàng' }).click()
  const dialog = page.getByRole('dialog', { name: 'Thêm Đơn Hàng' })
  await expect(dialog).toBeVisible()
  const dialogMotion = await dialog.evaluate((element) => ({
    animation: getComputedStyle(element).animationDuration,
    transition: getComputedStyle(element).transitionDuration,
  }))
  expect(parseFloat(dialogMotion.animation)).toBeLessThanOrEqual(0.00002)
  expect(parseFloat(dialogMotion.transition)).toBeLessThanOrEqual(0.00002)
})

test('filter and order dialog can be used immediately without waiting for motion completion', async ({ page }) => {
  const order: MockOrder = { id: 'motion-order', description: 'Motion-safe order', placed_at: '2026-05-04', amount: 1000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  await mockSupabase(page, 'admin', { cycles: [mayCycle], orders: [order] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })

  await page.locator('.cycle-filter-select > summary').click()
  await expect(page.locator('.cycle-filter-select .filter-select-menu')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Chọn Tất Cả Kỳ' }).uncheck()
  await page.getByLabel('05.2026 (21/04/2026 – 20/05/2026)').check()
  await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
  await expect(page.locator('.order-row')).toContainText('Motion-safe order')

  await page.getByRole('button', { name: 'Thêm Đơn Hàng' }).click()
  const dialog = page.getByRole('dialog', { name: 'Thêm Đơn Hàng' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Mô Tả Đơn Hàng').fill('Created without waiting for motion')
  await expect(dialog.getByLabel('Mô Tả Đơn Hàng')).toHaveValue('Created without waiting for motion')
})

test('cycle and status filter popovers stay clear of the toolbar and inside narrow viewports', async ({ page, expectNoHorizontalOverflow }) => {
  await mockSupabase(page, 'admin', {
    cycles: [mayCycle, juneCycle],
    orders: [{ id: 'filter-geometry-order', description: 'Filter geometry order', placed_at: '2026-05-04', amount: 1000, status: 'unpaid', billing_cycle_id: mayCycle.id }],
  })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  const toolbar = page.locator('.order-tools')
  const heading = page.locator('.orders-page-heading')
  const controls = [
    page.locator('.cycle-filter-select > summary'),
    page.locator('.status-filter-select > summary'),
    page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }),
    page.getByRole('button', { name: 'Thêm Đơn Hàng' }),
  ]
  const assertMenuGeometry = async (menu: Locator, width: number) => {
    await expect(menu).toBeVisible()
    await menu.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
    })
    const menuBounds = await menu.boundingBox()
    const toolbarBounds = await toolbar.boundingBox()
    const headingBounds = await heading.boundingBox()
    expect(menuBounds, `${width}px: filter menu visible`).not.toBeNull()
    expect(toolbarBounds, `${width}px: order toolbar visible`).not.toBeNull()
    expect(headingBounds, `${width}px: page heading visible`).not.toBeNull()
    const viewport = page.viewportSize()!
    expect(menuBounds!.x, `${width}px: menu left edge stays on screen`).toBeGreaterThanOrEqual(0)
    expect(menuBounds!.x + menuBounds!.width, `${width}px: menu right edge stays on screen`).toBeLessThanOrEqual(viewport.width)
    expect(menuBounds!.y, `${width}px: menu begins below full toolbar`).toBeGreaterThanOrEqual(toolbarBounds!.y + toolbarBounds!.height)
    expect(menuBounds!.y, `${width}px: menu does not cover the page heading`).toBeGreaterThanOrEqual(headingBounds!.y + headingBounds!.height)
    expect(menuBounds!.y + menuBounds!.height, `${width}px: menu bottom stays on screen`).toBeLessThanOrEqual(viewport.height)

    for (const control of controls) {
      const bounds = await control.boundingBox()
      expect(bounds, `${width}px: toolbar control remains visible`).not.toBeNull()
      const overlaps = menuBounds!.x < bounds!.x + bounds!.width
        && menuBounds!.x + menuBounds!.width > bounds!.x
        && menuBounds!.y < bounds!.y + bounds!.height
        && menuBounds!.y + menuBounds!.height > bounds!.y
      expect(overlaps, `${width}px: popover does not overlap toolbar controls`).toBe(false)
    }
    await expectNoHorizontalOverflow()
  }
  const expectSameBounds = (before: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>, after: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before[key] - after[key]), `trigger ${key} stays stable`).toBeLessThanOrEqual(1)
  }

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 800 : 844 })
    const cycleTrigger = controls[0]
    const cycleBefore = await cycleTrigger.boundingBox()
    expect(cycleBefore).not.toBeNull()
    await cycleTrigger.click()
    const cycleMenu = page.locator('.cycle-filter-select .filter-select-menu')
    await assertMenuGeometry(cycleMenu, width)
    await page.getByRole('checkbox', { name: 'Chọn Tất Cả Kỳ' }).check()
    const cycleAfter = await cycleTrigger.boundingBox()
    expect(cycleAfter).not.toBeNull()
    expectSameBounds(cycleBefore!, cycleAfter!)
    await assertMenuGeometry(cycleMenu, width)
    await cycleTrigger.click()

    const statusTrigger = controls[1]
    const statusBefore = await statusTrigger.boundingBox()
    expect(statusBefore).not.toBeNull()
    await statusTrigger.click()
    const statusMenu = page.locator('.status-filter-select .filter-select-menu')
    await assertMenuGeometry(statusMenu, width)
    await page.getByRole('checkbox', { name: 'Chọn Tất Cả Trạng Thái' }).uncheck()
    await page.getByRole('checkbox', { name: 'Chưa Thanh Toán', exact: true }).check()
    const statusAfter = await statusTrigger.boundingBox()
    expect(statusAfter).not.toBeNull()
    expectSameBounds(statusBefore!, statusAfter!)
    await assertMenuGeometry(statusMenu, width)
    await statusTrigger.click()
  }
})

test('long order descriptions expand to use available desktop table width', async ({ page }) => {
  const longDescription = 'Áo tràng phật tử nam nữ kate lụa cao cấp, áo dài lam đi chùa form rộng mềm mại Thiên Di D21 Phân loại hàng: Lam,L x1 '.repeat(5)
  await mockSupabase(page, 'admin', {
    orders: [{ id: 'order-long-desktop', description: longDescription, placed_at: '2026-05-19', amount: 1000, status: 'unpaid', billing_cycle_id: mayCycle.id }],
    cycles: [mayCycle],
  })
  await signIn(page, 'admin')
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  const table = page.locator('.orders-table')
  const description = page.locator('.order-row .order-item-lines')
  const tableBounds = await table.boundingBox()
  const descriptionBounds = await description.boundingBox()
  expect(tableBounds).not.toBeNull()
  expect(descriptionBounds).not.toBeNull()
  expect(descriptionBounds!.width, 'long descriptions should be allowed beyond the former 640px cap').toBeGreaterThan(640)
  expect(descriptionBounds!.width).toBeGreaterThan(tableBounds!.width * 0.45)
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
  await applyAllOrderCycles(page)
  const rows = page.locator('.order-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).not.toContainText(orders[0].id)
  await expect(page.locator('.order-row').filter({ hasText: 'Chè dưỡng nhan' }).locator('td').nth(4)).toHaveText('05.2026')

  const search = page.getByLabel('Tìm Kiếm Đơn Hàng')
  const clearSearch = page.getByRole('button', { name: 'Xóa Tìm Kiếm' })
  await expect(clearSearch).toHaveCount(0)
  await search.fill('sen')
  await expect(clearSearch).toBeVisible()
  const clearBounds = await clearSearch.boundingBox()
  const searchBounds = await page.getByRole('button', { name: 'Tìm Kiếm', exact: true }).boundingBox()
  expect(clearBounds).not.toBeNull()
  expect(searchBounds).not.toBeNull()
  expect(clearBounds!.x).toBeLessThan(searchBounds!.x)
  await expect(rows).toHaveCount(3)
  await search.press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Trà sen')
  await clearSearch.click()
  await expect(search).toHaveValue('')
  await expect(rows).toHaveCount(3)

  await search.fill('Bánh')
  await page.getByRole('button', { name: 'Tìm Kiếm', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Bánh trung thu')
  await clearSearch.click()
  await expect(search).toHaveValue('')
  await expect(rows).toHaveCount(3)

  await page.locator('.cycle-filter-select > summary').click()
  await page.getByRole('checkbox', { name: 'Chọn Tất Cả Kỳ' }).uncheck()
  await page.getByLabel('06.2026 (21/05/2026 – 20/06/2026)').check()
  await page.locator('.status-filter-select > summary').click()
  await page.getByRole('checkbox', { name: 'Chọn Tất Cả Trạng Thái' }).uncheck()
  await page.getByRole('checkbox', { name: 'Chưa Thanh Toán', exact: true }).check()
  await expect(rows).toHaveCount(3)
  await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Trà sen')
  await search.fill('sen')
  await page.getByRole('button', { name: 'Tìm Kiếm', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await clearSearch.click()
  await expect(search).toHaveValue('')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Trà sen')
  await expect(clearSearch).toHaveCount(0)
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
  await expectNoHorizontalOverflow()
})

test('Order sorting covers date, amount, cycle, and status without making description sortable', async ({ page }) => {
  const orders: MockOrder[] = [
    { id: 'sort-latest', description: 'Zebra unpaid', placed_at: '2026-05-12', amount: 600, status: 'unpaid', billing_cycle_id: juneCycle.id },
    { id: 'sort-paid', description: 'Alpha paid', placed_at: '2026-05-01', amount: 200, status: 'paid', billing_cycle_id: mayCycle.id },
    { id: 'sort-unassigned', description: 'Beta unpaid', placed_at: '2026-05-05', amount: 100, status: 'unpaid', billing_cycle_id: null },
    { id: 'sort-cancelled', description: 'Cancelled order', placed_at: '2026-05-10', amount: 400, status: 'cancelled', billing_cycle_id: mayCycle.id },
    { id: 'sort-deleted', description: 'Deleted order', placed_at: '2026-05-07', amount: 500, status: 'unpaid', billing_cycle_id: juneCycle.id, deleted_at: '2026-05-13T00:00:00.000Z' },
  ]
  await mockSupabase(page, 'admin', { orders, cycles: [mayCycle, juneCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  await applyAllOrderCycles(page)

  const rows = page.locator('.order-row')
  const names = async () => (await rows.locator('[data-label="Đơn Hàng"]').allTextContents()).map((name) => name.trim())
  const isMobile = (page.viewportSize()?.width ?? 0) <= 600
  const chooseSort = async (key: 'date' | 'amount' | 'cycle' | 'status', label: string) => {
    if (isMobile) await page.getByLabel('Sắp Xếp', { exact: true }).selectOption(key)
    else await page.getByRole('button', { name: new RegExp(`Sắp Xếp Theo ${label}`) }).click()
  }
  const reverseSort = async (key: 'date' | 'amount' | 'cycle' | 'status', label: string) => {
    if (isMobile) await page.getByRole('button', { name: 'Đổi Sang Giảm Dần' }).click()
    else await page.getByRole('button', { name: new RegExp(`Sắp Xếp Theo ${label}`) }).click()
  }

  if (!isMobile) {
    const descriptionHeader = page.getByRole('columnheader', { name: 'Đơn Hàng' })
    await expect(descriptionHeader.getByRole('button')).toHaveCount(0)
  } else {
    await expect(page.getByLabel('Sắp Xếp', { exact: true }).locator('option', { hasText: 'Đơn Hàng' })).toHaveCount(0)
  }

  await chooseSort('date', 'Ngày')
  await expect.poll(names).toEqual(['Alpha paid', 'Beta unpaid', 'Deleted order', 'Cancelled order', 'Zebra unpaid'])
  await reverseSort('date', 'Ngày')
  await expect.poll(names).toEqual(['Zebra unpaid', 'Cancelled order', 'Deleted order', 'Beta unpaid', 'Alpha paid'])

  await chooseSort('amount', 'Số Tiền')
  await expect.poll(names).toEqual(['Beta unpaid', 'Alpha paid', 'Cancelled order', 'Deleted order', 'Zebra unpaid'])
  await chooseSort('cycle', 'Kỳ')
  await expect.poll(names).toEqual(['Cancelled order', 'Alpha paid', 'Zebra unpaid', 'Deleted order', 'Beta unpaid'])
  await reverseSort('cycle', 'Kỳ')
  await expect.poll(names).toEqual(['Zebra unpaid', 'Deleted order', 'Cancelled order', 'Alpha paid', 'Beta unpaid'])
  await chooseSort('status', 'Trạng Thái')
  await expect.poll(names).toEqual(['Zebra unpaid', 'Beta unpaid', 'Alpha paid', 'Cancelled order', 'Deleted order'])
})

test('Selected tab survives refresh and browser Back/Forward while preserving unrelated query state', async ({ page }) => {
  await mockSupabase(page, 'admin')
  await page.goto('/?campaign=qa&tab=orders')
  await signIn(page, 'admin')
  await expect(page.getByRole('heading', { name: 'Đơn Hàng' })).toBeVisible()
  await expect(page).toHaveURL(/\?campaign=qa&tab=orders$/)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Đơn Hàng' })).toBeVisible()
  await expect(page).toHaveURL(/\?campaign=qa&tab=orders$/)
  await page.getByRole('button', { name: 'Báo Cáo' }).click()
  await expect(page.getByRole('heading', { name: 'Báo cáo kỳ' })).toBeVisible()
  await expect(page).toHaveURL(/\?campaign=qa&tab=reports$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Đơn Hàng' })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Báo cáo kỳ' })).toBeVisible()
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

test('Admin confirms the exact full balance for multiple selected orders without a partial status', async ({ page }) => {
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

  const recordPaymentButton = page.getByRole('button', { name: 'Ghi Nhận Đã Thanh Toán' })
  await expect(recordPaymentButton).toBeVisible()
  await recordPaymentButton.click()
  const confirmation = page.getByRole('dialog', { name: 'Xác Nhận Thanh Toán' })
  await expect(confirmation.getByText('Số Đơn').locator('..')).toContainText('2')
  await expect(confirmation.getByText('Tổng Thanh Toán').locator('..')).toContainText('3.000 ₫')
  await confirmation.getByRole('button', { name: 'Hủy' }).click()
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
  await recordPaymentButton.click()
  await page.getByRole('dialog', { name: 'Xác Nhận Thanh Toán' }).getByRole('button', { name: 'Xác Nhận Thanh Toán' }).click()

  await expect.poll(() => mock.payments).toHaveLength(1)
  await expect(page.locator('.order-row').filter({ hasText: 'First order' }).getByText('Đã Thanh Toán')).toBeVisible()
  const secondRow = page.locator('.order-row').filter({ hasText: 'Second order' })
  await expect(secondRow.getByText('Đã Thanh Toán')).toBeVisible()
  await expect(page.getByText('Trả Một Phần')).toHaveCount(0)
  const paymentRequest = mock.requests.find((request) => request.path === '/rest/v1/rpc/record_order_payment')
  expect(paymentRequest?.body).toMatchObject({ p_order_ids: expect.arrayContaining(['order-first', 'order-second']), p_amount: 3000, p_note: 'Admin xác nhận thanh toán' })
  expect(mock.payments).toHaveLength(1)
  expect(mock.allocations.map((allocation) => [allocation.order_id, allocation.amount])).toEqual([['order-first', 1000], ['order-second', 2000]])
})

test('Paid orders cannot be selected again; historical partial allocations stay unpaid and lock finance fields', async ({ page }) => {
  const paid: MockOrder = { id: 'order-paid-eligibility', description: 'Paid', placed_at: '2026-05-02', amount: 5000, status: 'paid', billing_cycle_id: mayCycle.id }
  // This allocation represents imported/historical data. The current payment flow never creates a partial order payment.
  const historicalAllocationOrder: MockOrder = { id: 'order-historical-allocation', description: 'Historical allocation', notes: 'Preserve this order note', placed_at: '2026-05-03', amount: 9000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const mock = await mockSupabase(page, 'admin', {
    orders: [paid, historicalAllocationOrder], cycles: [mayCycle],
    payments: [{ id: 'payment-prior', paid_at: '2026-05-04', amount: 5000, note: null }],
    allocations: [{ payment_id: 'payment-prior', order_id: paid.id, amount: 5000 }, { payment_id: 'payment-prior', order_id: historicalAllocationOrder.id, amount: 3000 }],
  })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  const paidRow = page.locator('.order-row').filter({ hasText: 'Paid' })
  const historicalRow = page.locator('.order-row').filter({ hasText: historicalAllocationOrder.description })
  await expect(paidRow).toHaveClass(/is-paid/)
  await expect(paidRow.getByRole('checkbox')).toHaveCount(0)
  await expect(historicalRow.getByRole('checkbox')).toHaveCount(1)
  const paidEdit = paidRow.getByRole('button', { name: 'Sửa Đơn' })
  await expect(paidEdit).toBeDisabled()
  await expect(paidEdit).toHaveAttribute('title', 'Đơn đã thanh toán không thể chỉnh sửa')
  await expect(paidRow.getByRole('button', { name: 'Hủy Đơn' })).toHaveCount(0)
  await expect(historicalRow.getByRole('button', { name: 'Hủy Đơn' })).toHaveAttribute('title', 'Chỉ hủy khi Shopee dừng đơn trước khi hoàn tất; nhập tiền đã hoàn nếu có.')

  await historicalRow.getByRole('button', { name: 'Sửa Đơn' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sửa Đơn Hàng' })
  await expect(dialog.getByLabel('Ngày Đặt')).toBeDisabled()
  await expect(dialog.getByLabel('Số Tiền (VND)')).toBeDisabled()
  await dialog.getByLabel('Mô Tả Đơn Hàng').fill('Historical allocation description corrected')
  await dialog.getByRole('button', { name: 'Lưu Đơn Hàng' }).click()
  await expect(page.locator('.order-row').filter({ hasText: 'Historical allocation description corrected' })).toContainText('9.000 ₫')
  const update = mock.requests.find((request) => request.path === '/rest/v1/rpc/update_order')
  expect(update?.body.p_notes).toBe('Preserve this order note')
  expect(mock.orders.find((order) => order.id === historicalAllocationOrder.id)?.notes).toBe('Preserve this order note')
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/record_order_payment')).toBe(false)
})

test('Admin confirms a Shopee cancellation and records only the entered refund amount', async ({ page }) => {
  const order: MockOrder = { id: 'order-partial-refund', description: 'Partially paid shipping order', placed_at: '2026-05-02', amount: 5000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const otherOrder: MockOrder = { id: 'order-unrelated-debt', description: 'Other unpaid order', placed_at: '2026-05-03', amount: 10000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  // The prior allocation is imported history; the Admin is canceling an unpaid order Shopee stopped before completion.
  const payment = { id: 'payment-existing', paid_at: '2026-05-04', amount: 3000, note: null }
  const allocation = { payment_id: payment.id, order_id: order.id, amount: 3000 }
  const mock = await mockSupabase(page, 'admin', { orders: [order, otherOrder], cycles: [mayCycle], payments: [payment], allocations: [allocation] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  const row = page.locator('.order-row').filter({ hasText: 'Partially paid shipping order' })
  await row.getByRole('button', { name: 'Hủy Đơn' }).click()
  const cancellation = page.getByRole('dialog', { name: 'Hủy Đơn Trên Shopee' })
  await expect(cancellation).toBeVisible()
  await expect(cancellation.getByText('Chỉ dùng khi Shopee đã dừng đơn trước khi hoàn tất.')).toBeVisible()
  await cancellation.getByLabel('Số Tiền Đã Hoàn (VND)').fill('2500')
  await cancellation.getByRole('button', { name: 'Xác Nhận Hủy Đơn' }).click()

  await expect(row.getByText('Đã Hủy')).toBeVisible()
  const cancelRequest = mock.requests.find((request) => request.path === '/rest/v1/rpc/cancel_order')
  expect(cancelRequest?.body).toMatchObject({ p_order_id: order.id, p_refund_amount: 2500, p_note: 'Hoàn tiền đơn Partially paid shipping order' })
  expect(mock.ledgerEntries).toHaveLength(1)
  expect(mock.ledgerEntries[0]).toMatchObject({ kind: 'refund', amount: 2500, billing_cycle_id: mayCycle.id })

  // The canceled purchase is excluded, while its retained 3,000 VND payment credit and 2,500 VND refund adjustment offset other debt.
  await page.getByRole('button', { name: 'ShopeeLin', exact: true }).click()
  await expect(page.getByText('Dư nợ Shopee hiện tại').locator('..').getByText('9.500 ₫')).toBeVisible()
})

test('Admin soft-deletes an unpaid order and restores its retained history', async ({ page }) => {
  const order: MockOrder = { id: 'order-delete', description: 'Unpaid test order', placed_at: '2026-05-02', amount: 9000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const activeOrder: MockOrder = { id: 'order-stays', description: 'Still owed order', placed_at: '2026-05-03', amount: 3000, status: 'unpaid', billing_cycle_id: mayCycle.id }
  const mock = await mockSupabase(page, 'admin', { orders: [order, activeOrder], cycles: [mayCycle] })
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()

  const row = page.locator('.order-row').filter({ hasText: 'Unpaid test order' })
  await row.getByRole('button', { name: 'Xóa Đơn' }).click()
  const deletion = page.getByRole('dialog', { name: 'Xóa Đơn Hàng' })
  await expect(deletion.getByText(/Đơn vẫn được lưu và có thể khôi phục/)).toBeVisible()
  await deletion.getByRole('button', { name: 'Xác Nhận Xóa' }).click()
  await expect(row.getByText('Đã Xóa')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Sửa Đơn' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Xóa Đơn' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Khôi Phục Đơn' })).toBeVisible()
  expect(row).toHaveClass(/is-deleted/)
  expect(mock.orders).toHaveLength(2)
  await page.getByRole('button', { name: 'ShopeeLin', exact: true }).click()
  await expect(page.getByText('Dư nợ Shopee hiện tại').locator('..').getByText('3.000 ₫')).toBeVisible()
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
  const deletedRow = page.locator('.order-row').filter({ hasText: 'Unpaid test order' })
  expect(mock.requests.some((request) => request.path === '/rest/v1/rpc/soft_delete_order' && request.body.p_order_id === order.id)).toBe(true)
  expect(mock.requests.some((request) => request.method === 'DELETE')).toBe(false)

  await deletedRow.getByRole('button', { name: 'Khôi Phục Đơn' }).click()
  const restore = page.getByRole('dialog', { name: 'Khôi Phục Đơn Hàng' })
  await expect(restore.getByText('Đơn sẽ xuất hiện lại với trạng thái Chưa Thanh Toán.')).toBeVisible()
  await restore.getByRole('button', { name: 'Khôi Phục Đơn' }).click()
  await expect(row.getByText('Chưa Thanh Toán')).toBeVisible()
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
