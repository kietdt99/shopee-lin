import { test as base, expect, type Page } from '@playwright/test'

export type TestRole = 'admin' | 'viewer'
export type MockOrder = {
  id: string
  description: string
  placed_at: string
  amount: number
  status: 'unpaid' | 'paid' | 'cancelled'
  billing_cycle_id: string | null
}

export type MockCycle = {
  id: string
  label: string
  starts_on: string
  ends_on: string
  opening_balance: number
  status: 'open' | 'closed'
}

type MockPayment = { id: string; paid_at: string; amount: number; note: string | null }
type MockAllocation = { payment_id: string; order_id: string; amount: number }
type MockSeed = { orders?: MockOrder[]; cycles?: MockCycle[]; payments?: MockPayment[]; allocations?: MockAllocation[] }

const userIds: Record<TestRole, string> = {
  admin: '00000000-0000-4000-8000-000000000001',
  viewer: '00000000-0000-4000-8000-000000000002',
}

const profiles = [
  {
    id: userIds.admin,
    email: 'admin@example.test',
    full_name: 'Bé Kịt Thần Kỳ',
    role: 'admin',
  },
  {
    id: userIds.viewer,
    email: 'viewer@example.test',
    full_name: 'Bé Lin Tốc Độ Cao',
    role: 'viewer',
  },
]

export async function mockSupabase(page: Page, role: TestRole, seed: MockSeed = {}) {
  const userId = userIds[role]
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: role === 'admin' ? 'admin@example.test' : 'viewer@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
  }
  const authSession = {
    access_token: `test-access-token-${role}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `test-refresh-token-${role}`,
    user,
  }
  const state = {
    profiles: profiles.map((profile) => ({ ...profile })),
    orders: [...(seed.orders ?? [])],
    cycles: [...(seed.cycles ?? [])],
    payments: [...(seed.payments ?? [])],
    allocations: [...(seed.allocations ?? [])],
    ledgerEntries: [] as { id: string; billing_cycle_id: string; entry_date: string; kind: string; amount: number; description: string }[],
    requests: [] as { method: string; path: string; query: string; body: any }[],
  }
  let nextId = 1
  const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`

  await page.route('https://playwright-test.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() : null
    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/functions/v1/')) {
      state.requests.push({ method, path: url.pathname, query: url.search, body })
    }

    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      const body = request.postDataJSON() as { email?: string; password?: string }
      const expectedEmail = role === 'admin' ? 'admin@example.test' : 'viewer@example.test'
      if (body.email !== expectedEmail || body.password !== 'test-password') {
        await route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } })
        return
      }
      await route.fulfill({ status: 200, json: authSession })
      return
    }

    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
      await route.fulfill({ status: 200, json: user })
      return
    }

    if (url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/')) {
      const table = url.pathname.split('/').at(-1)
      let data: unknown = []
      if (table === 'profiles') {
        const currentProfiles = state.profiles
        data = url.searchParams.has('id')
          ? currentProfiles.find((profile) => profile.id === url.searchParams.get('id')?.replace('eq.', '')) ?? null
          : currentProfiles
      } else if (table === 'orders') {
        if (method === 'GET') data = [...state.orders].sort((a, b) => b.placed_at.localeCompare(a.placed_at))
        if (method === 'POST') {
          const order = { id: newId(), status: 'unpaid', ...body } as MockOrder
          state.orders.push(order)
          await route.fulfill({ status: 201 })
          return
        }
        if (method === 'PATCH') {
          const id = url.searchParams.get('id')?.replace('eq.', '')
          state.orders = state.orders.map((order) => order.id === id ? { ...order, ...body } : order)
          await route.fulfill({ status: 204 })
          return
        }
        if (method === 'DELETE') {
          const id = url.searchParams.get('id')?.replace('eq.', '')
          state.orders = state.orders.filter((order) => order.id !== id)
          await route.fulfill({ status: 204 })
          return
        }
      } else if (table === 'billing_cycles') {
        if (method === 'GET') {
          const label = url.searchParams.get('label')?.replace('eq.', '')
          const cycle = label ? state.cycles.find((item) => item.label === label) : undefined
          data = label ? cycle ?? null : [...state.cycles].sort((a, b) => b.starts_on.localeCompare(a.starts_on))
        } else if (method === 'POST') {
          const cycle = { id: newId(), status: 'open', opening_balance: 0, ...body } as MockCycle
          state.cycles.push(cycle)
          await route.fulfill({
            status: 201,
            headers: { 'content-type': 'application/json; charset=utf-8', 'content-range': '0-0/1' },
            json: { id: cycle.id },
          })
          return
        }
      } else if (table === 'installment_summary') {
        data = [{ id: 's25-ultra', name: 'S25 Ultra', total_amount: 20_000_000, total_paid: 2_000_000 }]
      } else if (table === 'payments') {
        data = [...state.payments]
      } else if (table === 'payment_allocations') {
        data = [...state.allocations]
      } else if (table === 'ledger_entries') {
        data = [...state.ledgerEntries]
      }

      if (method !== 'GET' && !['orders'].includes(table ?? '')) {
        await route.fulfill({ status: 204 })
        return
      }
      await route.fulfill({
        status: 200,
        headers: { 'content-range': Array.isArray(data) ? `0-${Math.max(data.length - 1, 0)}/${data.length}` : data === null ? '*/0' : '0-0/1' },
        ...(data === null ? { body: '' } : { json: data }),
      })
      return
    }

    if (url.pathname === '/rest/v1/rpc/record_order_payment' && method === 'POST') {
      const paymentId = newId()
      let remaining = Number(body.p_amount)
      const selected = state.orders
        .filter((order) => body.p_order_ids.includes(order.id) && order.status === 'unpaid')
        .sort((a, b) => a.placed_at.localeCompare(b.placed_at))
      const allocatedByOrder = new Map<string, number>()
      for (const allocation of state.allocations) allocatedByOrder.set(allocation.order_id, (allocatedByOrder.get(allocation.order_id) ?? 0) + allocation.amount)
      for (const order of selected) {
        if (remaining <= 0) break
        const alreadyAllocated = allocatedByOrder.get(order.id) ?? 0
        const allocation = Math.min(remaining, order.amount - alreadyAllocated)
        if (allocation > 0) {
          state.allocations.push({ payment_id: paymentId, order_id: order.id, amount: allocation })
          remaining -= allocation
          if (allocation === order.amount - alreadyAllocated) order.status = 'paid'
        }
      }
      if (remaining > 0 || !Number.isSafeInteger(body.p_amount) || body.p_amount <= 0) {
        state.allocations = state.allocations.filter((allocation) => allocation.payment_id !== paymentId)
        for (const order of state.orders) {
          const totalAllocated = state.allocations.filter((allocation) => allocation.order_id === order.id).reduce((sum, allocation) => sum + allocation.amount, 0)
          if (order.status === 'paid' && totalAllocated < order.amount) order.status = 'unpaid'
        }
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Selected orders cannot absorb the full payment amount' } })
        return
      }
      state.payments.push({ id: paymentId, paid_at: body.p_paid_at, amount: body.p_amount, note: body.p_note })
      await route.fulfill({ status: 200, json: paymentId })
      return
    }

    if (url.pathname === '/rest/v1/rpc/cancel_order' && method === 'POST') {
      const order = state.orders.find((item) => item.id === body.p_order_id)
      if (!order) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Order not found' } })
        return
      }
      const refundedPreviously = state.ledgerEntries.filter((entry) => entry.kind === 'refund' && entry.description === body.p_note).reduce((sum, entry) => sum + entry.amount, 0)
      const received = state.allocations.filter((allocation) => allocation.order_id === order.id).reduce((sum, allocation) => sum + allocation.amount, 0)
      if (!Number.isSafeInteger(body.p_refund_amount) || body.p_refund_amount < 0 || body.p_refund_amount + refundedPreviously > received) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Refund amount exceeds received allocation' } })
        return
      }
      order.status = 'cancelled'
      if (body.p_refund_amount > 0) state.ledgerEntries.push({
        id: newId(), billing_cycle_id: order.billing_cycle_id ?? '', entry_date: new Date().toISOString().slice(0, 10),
        kind: 'refund', amount: body.p_refund_amount, description: body.p_note,
      })
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/update_my_display_name' && method === 'POST') {
      const profile = state.profiles.find((item) => item.id === userId)
      if (profile) profile.full_name = body.p_display_name
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/functions/v1/admin-reset-password-link' && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        json: {
          actionLink: 'https://playwright-test.supabase.co/auth/v1/verify?token=test-recovery-token&type=recovery',
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
      })
      return
    }

    if (url.pathname.startsWith('/auth/v1/')) {
      await route.fulfill({ status: 404, json: { message: 'Unexpected mocked Auth request' } })
      return
    }

    await route.fulfill({ status: 404, json: { message: `Unexpected request: ${url.pathname}` } })
  })

  return state
}

export const test = base.extend<{ expectNoHorizontalOverflow: () => Promise<void> }>({
  expectNoHorizontalOverflow: async ({ page }, use) => {
    await use(async () => {
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }))
      expect(dimensions.content, `page content overflows viewport (${dimensions.content}px > ${dimensions.viewport}px)`).toBeLessThanOrEqual(dimensions.viewport)
    })
  },
})

export { expect }

export async function signIn(page: Page, role: TestRole) {
  const email = role === 'admin' ? 'admin@example.test' : 'viewer@example.test'
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('heading', { name: 'Bé Lin' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tổng quan' })).toBeVisible()
}
