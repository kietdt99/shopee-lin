import { test, expect, mockSupabase, signIn } from './fixtures'
import type { MockCycle, MockOrder } from './fixtures'

const cycle: MockCycle = {
  id: 'suggestion-cycle-2026',
  label: '06.2026',
  starts_on: '2026-05-21',
  ends_on: '2026-06-20',
  opening_balance: 0,
  status: 'open',
}

const longDescription = 'Áo dài Phật tử nữ chất liệu cotton mềm mại, thiết kế thanh lịch dùng đi lễ và sinh hoạt hằng ngày'
const suggestionDescriptions = [
  longDescription,
  'Áo thun cotton nữ tay ngắn',
  'Áo len cổ polo nữ dệt vặn thừng',
  'Áo khoác chống nắng dáng dài',
  'Áo sơ mi nữ tay phồng',
  'Áo hoodie unisex form rộng',
  'Áo vest nữ công sở',
]

const orders: MockOrder[] = [
  ...suggestionDescriptions.map((description, index) => ({
    id: `suggestion-order-${index + 1}`,
    description,
    placed_at: `2026-05-${String(index + 1).padStart(2, '0')}`,
    amount: 100_000 + index,
    status: 'unpaid' as const,
    billing_cycle_id: cycle.id,
  })),
  {
    id: 'suggestion-order-duplicate',
    description: longDescription,
    placed_at: '2026-05-10',
    amount: 150_000,
    status: 'unpaid',
    billing_cycle_id: cycle.id,
  },
]

async function openOrders(page: import('@playwright/test').Page) {
  await mockSupabase(page, 'admin', { orders, cycles: [cycle] })
  await page.goto('/')
  await signIn(page, 'admin')
  await page.getByRole('button', { name: 'Đơn Hàng' }).click()
}

test('search suggestions shorten labels, cap at six, and support arrow-key selection without filtering early', async ({ page }) => {
  await openOrders(page)

  const rows = page.locator('.order-row')
  const search = page.getByRole('combobox', { name: 'Tìm Kiếm Đơn Hàng' })
  const listbox = page.getByRole('listbox', { name: 'Gợi Ý Đơn Hàng' })
  await expect(rows).toHaveCount(8)

  await search.fill('Áo')
  await expect(search).toHaveAttribute('aria-expanded', 'true')
  await expect(listbox).toBeVisible()
  const options = listbox.getByRole('option')
  await expect(options).toHaveCount(6)
  await expect(options.first()).toHaveAttribute('aria-label', longDescription)
  const visibleLabel = (await options.first().innerText()).trim()
  expect(visibleLabel.length).toBeLessThan(longDescription.length)
  expect(visibleLabel).toMatch(/…$/)

  // Typing only opens suggestions; the applied order list remains unchanged.
  await expect(rows).toHaveCount(8)
  await search.press('ArrowDown')
  await search.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await search.press('ArrowUp')
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await search.press('Enter')

  await expect(search).toHaveValue(longDescription)
  await expect(search).toHaveAttribute('aria-expanded', 'false')
  await expect(listbox).toHaveCount(0)
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText(longDescription)
})

test('search suggestions reopen on focus, dismiss with Escape or outside click, and apply on mouse selection', async ({ page }) => {
  await openOrders(page)

  const rows = page.locator('.order-row')
  const search = page.getByRole('combobox', { name: 'Tìm Kiếm Đơn Hàng' })
  const listbox = page.getByRole('listbox', { name: 'Gợi Ý Đơn Hàng' })
  await search.fill('Áo')
  await expect(listbox).toBeVisible()
  await search.press('Escape')
  await expect(listbox).toHaveCount(0)
  await expect(search).toHaveValue('Áo')
  await expect(rows).toHaveCount(8)

  // Blur before refocusing so the input receives a real focus transition.
  await page.getByRole('heading', { name: 'Đơn Hàng' }).click()
  await search.focus()
  await expect(listbox).toBeVisible()
  await page.getByRole('heading', { name: 'Đơn Hàng' }).click()
  await expect(listbox).toHaveCount(0)
  await expect(rows).toHaveCount(8)

  await search.focus()
  await expect(listbox).toBeVisible()
  await listbox.getByRole('option', { name: suggestionDescriptions[2], exact: true }).click()
  await expect(search).toHaveValue(suggestionDescriptions[2])
  await expect(search).toHaveAttribute('aria-expanded', 'false')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(suggestionDescriptions[2])
})
