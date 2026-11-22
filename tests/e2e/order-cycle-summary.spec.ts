import { test, expect, mockSupabase, signIn } from './fixtures'
import type { MockCycle, MockOrder } from './fixtures'

const may: MockCycle = { id: 'summary-may', label: '05.2026', starts_on: '2026-04-21', ends_on: '2026-05-20', opening_balance: 0, status: 'open' }
const june: MockCycle = { id: 'summary-june', label: '06.2026', starts_on: '2026-05-21', ends_on: '2026-06-20', opening_balance: 0, status: 'open' }

const orders: MockOrder[] = [
  { id: 'june-unpaid', description: 'June searchable unpaid', placed_at: '2026-06-02', amount: 1_000, status: 'unpaid', billing_cycle_id: june.id },
  { id: 'june-paid', description: 'June paid item', placed_at: '2026-06-01', amount: 500, status: 'paid', billing_cycle_id: june.id },
  { id: 'may-unpaid', description: 'May unpaid item', placed_at: '2026-05-18', amount: 2_000, status: 'unpaid', billing_cycle_id: may.id },
  { id: 'deleted-order', description: 'Deleted history', placed_at: '2026-06-03', amount: 900, status: 'unpaid', billing_cycle_id: june.id, deleted_at: '2026-06-04' },
  { id: 'cancelled-order', description: 'Cancelled history', placed_at: '2026-06-05', amount: 700, status: 'cancelled', billing_cycle_id: june.id },
]

for (const role of ['admin', 'viewer'] as const) {
  test(`${role} payment totals follow applied cycles and ignore search/status visibility`, async ({ page }) => {
    await mockSupabase(page, role, {
      orders,
      cycles: [may, june],
      allocations: [
        { payment_id: 'p1', order_id: 'june-unpaid', amount: 250 },
        { payment_id: 'p2', order_id: 'june-paid', amount: 500 },
        { payment_id: 'p3', order_id: 'may-unpaid', amount: 100 },
        { payment_id: 'p4', order_id: 'deleted-order', amount: 900 },
        { payment_id: 'p5', order_id: 'cancelled-order', amount: 700 },
      ],
    })
    await page.goto('/')
    await signIn(page, role)
    await page.getByRole('button', { name: 'Đơn Hàng' }).click()

    const summary = page.locator('.cycle-payment-summary')
    const paidTotal = summary.locator('.cycle-payment-metric').nth(0)
    const unpaidTotal = summary.locator('.cycle-payment-metric').nth(1)
    await expect(summary).toContainText('06.2026')
    await expect(summary).toContainText('21/05/2026 – 20/06/2026')
    await expect(paidTotal).toContainText('750')
    await expect(unpaidTotal).toContainText('750')

    const search = page.getByRole('combobox', { name: 'Tìm Kiếm Đơn Hàng' })
    await search.fill('June paid item')
    await search.press('Enter')
    await expect(page.locator('.order-row')).toHaveCount(1)
    await expect(paidTotal).toContainText('750')
    await expect(unpaidTotal).toContainText('750')

    await page.locator('.status-filter-select > summary').click()
    await page.getByRole('checkbox', { name: 'Đã Thanh Toán', exact: true }).check()
    await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()
    await expect(page.locator('.order-row')).toHaveCount(1)
    await expect(paidTotal).toContainText('750')
    await expect(unpaidTotal).toContainText('750')

    const cycleTrigger = page.locator('.cycle-filter-select > summary')
    await cycleTrigger.click()
    await page.getByLabel('06.2026 (21/05/2026 – 20/06/2026)').uncheck()
    await expect(paidTotal).toContainText('750')
    await expect(unpaidTotal).toContainText('750')
    await page.getByRole('button', { name: 'Áp Dụng Bộ Lọc' }).click()

    await expect(summary).toContainText('Tất cả kỳ')
    await expect(paidTotal).toContainText('850')
    await expect(unpaidTotal).toContainText('2.650')
  })
}
