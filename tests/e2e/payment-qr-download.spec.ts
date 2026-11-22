import { test, expect, mockSupabase, signIn } from './fixtures'

const configuredQr = {
  singleton: true as const,
  note: 'Thông báo cho bé Kịt sau khi chuyển khoản nhé 😘',
  qr_image_path: 'viewer/qr-thanh-toan.png',
  updated_at: '2026-11-22T00:00:00.000Z',
  updated_by: '00000000-0000-4000-8000-000000000001',
}

async function openViewerPaymentDialog(page: import('@playwright/test').Page) {
  await signIn(page, 'viewer')
  await page.getByRole('button', { name: 'Thanh toán' }).click()
  return page.getByRole('dialog', { name: 'Thanh toán' })
}

for (const { mimeType, extension } of [
  { mimeType: 'image/png', extension: 'png' },
  { mimeType: 'image/jpeg', extension: 'jpg' },
  { mimeType: 'image/webp', extension: 'webp' },
]) {
  test(`Viewer downloads the configured ${mimeType} QR from its signed URL with a stable filename`, async ({ page }) => {
    await mockSupabase(page, 'viewer', { paymentSettings: configuredQr })
    let fetchedUrl = ''
    await page.route('http://127.0.0.1:54321/storage/v1/object/sign/payment-qr/**', async (route) => {
      if (route.request().method() !== 'GET' || route.request().resourceType() !== 'fetch') return route.fallback()
      fetchedUrl = route.request().url()
      await route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': mimeType },
        body: Buffer.from(`mock-${extension}-image`),
      })
    })
    await page.goto('/')

    const dialog = await openViewerPaymentDialog(page)
    const image = dialog.getByRole('img', { name: 'Ảnh QR thanh toán' })
    await expect(image).toBeVisible()
    const signedImageUrl = await image.getAttribute('src')
    expect(signedImageUrl).toContain('/storage/v1/object/sign/payment-qr/viewer/qr-thanh-toan.png?token=mock')
    await expect(dialog.getByText(configuredQr.note)).toBeVisible()
    const downloadEvent = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Tải ảnh QR' }).click()
    const download = await downloadEvent

    expect(fetchedUrl).toBe(signedImageUrl)
    expect(download.suggestedFilename()).toBe(`ShopeeLin-QR-Thanh-Toan.${extension}`)
    await expect(dialog.getByRole('alert')).toHaveCount(0)
  })
}

test('Viewer without a configured QR sees a useful empty state and no download action', async ({ page }) => {
  await mockSupabase(page, 'viewer', { paymentSettings: { ...configuredQr, qr_image_path: null } })
  const configuredPort = Number(process.env.PLAYWRIGHT_PORT_BASE) || 4173
  await page.goto(`http://127.0.0.1:${configuredPort + 2}/`)

  const dialog = await openViewerPaymentDialog(page)
  await expect(dialog.getByText('Chưa có ảnh QR thanh toán.')).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'Ảnh QR thanh toán' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Tải ảnh QR' })).toHaveCount(0)
})

test('Viewer sees an accessible error when QR download fails', async ({ page }) => {
  await mockSupabase(page, 'viewer', { paymentSettings: configuredQr })
  await page.route('http://127.0.0.1:54321/storage/v1/object/sign/payment-qr/**', async (route) => {
    if (route.request().method() !== 'GET' || route.request().resourceType() !== 'fetch') return route.fallback()
    await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'unavailable' })
  })
  await page.goto('/')

  const dialog = await openViewerPaymentDialog(page)
  const signedImageUrl = await dialog.getByRole('img', { name: 'Ảnh QR thanh toán' }).getAttribute('src')
  await dialog.getByRole('button', { name: 'Tải ảnh QR' }).click()
  const error = dialog.getByRole('alert')
  await expect(error).toContainText('Không thể tải ảnh QR')
  const openImage = error.getByRole('link', { name: 'Mở ảnh QR trong tab mới' })
  await expect(openImage).toHaveAttribute('href', signedImageUrl!)
  await expect(openImage).toHaveAttribute('target', '_blank')
  await expect(openImage).toHaveAttribute('rel', /noopener/)
})
