import { test, expect, mockSupabase, signIn, type MockCycle, type MockOrder } from './fixtures'

const performanceCycle: MockCycle = {
  id: 'performance-cycle-2026-11',
  label: '11.2026',
  starts_on: '2026-10-21',
  ends_on: '2026-11-20',
  opening_balance: 0,
  status: 'open',
}

function makeOrders(count: number): MockOrder[] {
  return Array.from({ length: count }, (_, index) => {
    const isSearchTarget = index === count - 1
    const cycleDay = index % 31
    const placedAt = cycleDay < 11
      ? `2026-10-${String(21 + cycleDay).padStart(2, '0')}`
      : `2026-11-${String(cycleDay - 10).padStart(2, '0')}`
    return {
      id: `performance-order-${String(index + 1).padStart(4, '0')}`,
      description: isSearchTarget
        ? `Performance Search Target ${count} orders`
        : `Synthetic purchase ${String(index + 1).padStart(4, '0')} · daily order item`,
      placed_at: placedAt,
      amount: 10_000 + index,
      status: 'unpaid',
      billing_cycle_id: performanceCycle.id,
    }
  })
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    medianMs: Number(sorted[1].toFixed(2)),
    rangeMs: [Number(sorted[0].toFixed(2)), Number(sorted[2].toFixed(2))],
    runsMs: values.map((value) => Number(value.toFixed(2))),
  }
}

test.describe('mocked Orders client performance baseline', () => {
  test.setTimeout(180_000)

  for (const count of [60, 1_000]) {
    test(`${count} synthetic orders: render and submitted search`, async ({ browser, baseURL }, testInfo) => {
      test.skip(testInfo.project.name.includes('mobile'), 'This baseline fixes the viewport at desktop 1280×800 and runs only on desktop Chrome/Edge projects.')

      const orders = makeOrders(count)
      const targetDescription = `Performance Search Target ${count} orders`
      const renderTimes: number[] = []
      const searchTimes: number[] = []

      for (let run = 1; run <= 3; run += 1) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
        const page = await context.newPage()
        await mockSupabase(page, 'admin', { orders, cycles: [performanceCycle] })
        await page.goto(baseURL!)
        await signIn(page, 'admin')

        const rows = page.locator('.order-row')
        const renderStartedAt = performance.now()
        await page.getByRole('button', { name: 'Đơn Hàng', exact: true }).click()
        await expect(rows).toHaveCount(count)
        const renderMs = performance.now() - renderStartedAt
        renderTimes.push(renderMs)

        const search = page.getByLabel('Tìm Kiếm Đơn Hàng')
        await search.fill(`performance search target ${count}`)
        const searchStartedAt = performance.now()
        await page.getByRole('button', { name: 'Tìm Kiếm', exact: true }).click()
        await expect(rows).toHaveCount(1)
        await expect(rows.first()).toContainText(targetDescription)
        const searchMs = performance.now() - searchStartedAt
        searchTimes.push(searchMs)
        await context.close()

        console.log(JSON.stringify({
          type: 'orders-client-performance-sample',
          project: testInfo.project.name,
          browserVersion: browser.version(),
          datasetOrders: count,
          run,
          renderUntilRowsMs: Number(renderMs.toFixed(2)),
          submittedSearchUntilResultsMs: Number(searchMs.toFixed(2)),
        }))
      }

      const result = {
        scope: 'mocked client-side browser UI; synthetic orders; no live network/backend/load claim',
        project: testInfo.project.name,
        browserVersion: browser.version(),
        viewport: '1280x800 CSS px',
        datasetOrders: count,
        repetitions: 3,
        renderUntilRows: summarize(renderTimes),
        submittedSearchUntilResults: summarize(searchTimes),
      }
      await testInfo.attach(`orders-performance-${count}-${testInfo.project.name}.json`, {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      })
      console.log(JSON.stringify({ type: 'orders-client-performance-summary', ...result }))
    })
  }
})
