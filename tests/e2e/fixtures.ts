import { test as base, expect, type Page } from '@playwright/test'

export type TestRole = 'admin' | 'viewer'
export type MockOrder = {
  id: string
  description: string
  placed_at: string
  amount: number
  status: 'unpaid' | 'paid' | 'cancelled'
  billing_cycle_id: string | null
  shopee_order_url?: string | null
  deleted_at?: string | null
  deleted_by?: string | null
  notes?: string | null
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
type MockClosing = { billing_cycle_id: string; opening_balance: number; purchase_total: number; payment_total: number; adjustment_total: number; closing_balance: number; next_opening_before: number | null }
type MockLedgerEntry = { id: string; billing_cycle_id: string; entry_date: string; kind: string; amount: number; description: string }
type MockInstallmentSummary = { id: string; name: string; total_amount: number; total_paid: number }
type MockInstallmentPayment = { id: string; plan_id: string; paid_at: string; amount: number; note: string | null }
type MockPaymentSettings = { singleton: true; note: string; qr_image_path: string | null; updated_at: string; updated_by: string | null }
type MockSeed = {
  orders?: MockOrder[]
  cycles?: MockCycle[]
  payments?: MockPayment[]
  allocations?: MockAllocation[]
  closings?: MockClosing[]
  ledgerEntries?: MockLedgerEntry[]
  installmentSummary?: MockInstallmentSummary[]
  installmentPayments?: MockInstallmentPayment[]
  paymentSettings?: MockPaymentSettings
}

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
    profiles: profiles.map((profile) => ({ ...profile, avatar_path: null as string | null })),
    orders: [...(seed.orders ?? [])],
    cycles: [...(seed.cycles ?? [])],
    payments: [...(seed.payments ?? [])],
    allocations: [...(seed.allocations ?? [])],
    closings: [...(seed.closings ?? [])],
    ledgerEntries: [...(seed.ledgerEntries ?? [])],
    installmentSummary: [...(seed.installmentSummary ?? [{ id: 's25-ultra', name: 'S25 Ultra', total_amount: 20_000_000, total_paid: 2_000_000 }])],
    installmentPayments: [...(seed.installmentPayments ?? [])],
    paymentSettings: seed.paymentSettings ?? {
      singleton: true,
      note: 'Sau khi chuyển khoản xong, hãy thông báo cho bé Kịt để xác nhận thanh toán nhé 😘',
      qr_image_path: null,
      updated_at: '2026-11-22T00:00:00.000Z',
      updated_by: userIds.admin,
    },
    storageObjects: new Set<string>(),
    requests: [] as { method: string; path: string; query: string; body: any }[],
  }
  let nextId = 1
  const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`

  await page.route(/https:\/\/playwright-test\.supabase\.co\/.*|http:\/\/127\.0\.0\.1:54321\/.*$/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    let body: any = null
    if (request.postData()) {
      try { body = request.postDataJSON() } catch { body = null }
    }
    if (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/functions/v1/') || url.pathname.startsWith('/storage/v1/')) {
      state.requests.push({ method, path: url.pathname, query: url.search, body })
    }

    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') {
      const body = request.postDataJSON() as { email?: string; password?: string }
      const expectedEmail = role === 'admin' ? 'admin@example.test' : 'viewer@example.test'
      const localAccountEmail = role === 'admin' ? 'tuankiet141199@gmail.com' : 'tuankiet141199+lin-test@gmail.com'
      const regularLogin = body.email === expectedEmail && body.password === 'test-password'
      const localQuickLogin = body.email === localAccountEmail && body.password === 'Shopee-Lin-Local-Only-2026'
      if (!regularLogin && !localQuickLogin) {
        await route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } })
        return
      }
      await route.fulfill({ status: 200, json: { ...authSession, user: { ...user, email: body.email } } })
      return
    }

    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
      await route.fulfill({ status: 200, json: user })
      return
    }

    if (url.pathname === '/auth/v1/user' && request.method() === 'PUT') {
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
        if (method === 'GET') {
          const selectedColumns = url.searchParams.get('select')?.split(',')
          const sortedOrders = [...state.orders].sort((a, b) => b.placed_at.localeCompare(a.placed_at))
          data = selectedColumns
            ? sortedOrders.map((order) => Object.fromEntries(selectedColumns.filter((column) => column in order).map((column) => [column, order[column as keyof MockOrder]])))
            : sortedOrders
        }
        if (method === 'POST') {
          const order = { id: newId(), status: 'unpaid', ...body } as MockOrder
          state.orders.push(order)
          await route.fulfill({ status: 201 })
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
        data = state.installmentSummary
      } else if (table === 'installment_payments') {
        data = state.installmentPayments
      } else if (table === 'payments') {
        data = [...state.payments]
      } else if (table === 'payment_allocations') {
        data = [...state.allocations]
      } else if (table === 'ledger_entries') {
        data = [...state.ledgerEntries]
      } else if (table === 'cycle_closings') {
        data = [...state.closings]
      } else if (table === 'payment_settings') {
        data = state.paymentSettings
      }

      if (method === 'POST' && table === 'installment_plans') {
        const plan = { id: newId(), name: body.name, total_amount: body.total_amount, total_paid: 0 }
        state.installmentSummary.push(plan)
        await route.fulfill({ status: 201 })
        return
      }
      if (method === 'POST' && table === 'installment_payments') {
        const payment = { id: newId(), ...body }
        state.installmentPayments.push(payment)
        const plan = state.installmentSummary.find((item) => item.id === body.plan_id)
        if (plan) plan.total_paid += body.amount
        await route.fulfill({ status: 201 })
        return
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

    if (url.pathname.startsWith('/storage/v1/object/')) {
      const parts = url.pathname.split('/').filter(Boolean)
      if (method === 'POST' && parts[3] === 'sign' && parts[4] === 'payment-qr') {
        const objectPath = decodeURIComponent(parts.slice(5).join('/'))
        await route.fulfill({ status: 200, json: { signedURL: `/object/sign/payment-qr/${objectPath}?token=mock` } })
        return
      }
      if (method === 'GET' && parts[3] === 'sign' && parts[4] === 'payment-qr') {
        await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="white"/><path d="M20 20h280v280H20z" fill="none" stroke="#ee4d2d" stroke-width="8"/></svg>' })
        return
      }
      if (method === 'POST' && parts[3] === 'payment-qr') {
        const objectPath = decodeURIComponent(parts.slice(4).join('/'))
        state.storageObjects.add(objectPath)
        await route.fulfill({ status: 200, json: { Key: `payment-qr/${objectPath}` } })
        return
      }
      if (method === 'POST' && parts[3] === 'profile-avatars') {
        const objectPath = decodeURIComponent(parts.slice(4).join('/'))
        state.storageObjects.add(objectPath)
        await route.fulfill({ status: 200, json: { Key: `profile-avatars/${objectPath}` } })
        return
      }
      if (method === 'POST' && parts[3] === 'sign' && parts[4] === 'profile-avatars') {
        const objectPath = decodeURIComponent(parts.slice(5).join('/'))
        if (!state.storageObjects.has(objectPath)) {
          await route.fulfill({ status: 404, json: { message: 'Object not found' } })
          return
        }
        await route.fulfill({ status: 200, json: { signedURL: `/object/sign/profile-avatars/${objectPath}?token=mock` } })
        return
      }
    }

    if (url.pathname === '/rest/v1/rpc/update_payment_settings' && method === 'POST') {
      state.paymentSettings = {
        ...state.paymentSettings,
        note: body.p_note,
        qr_image_path: body.p_qr_image_path,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/record_order_payment' && method === 'POST') {
      const paymentId = newId()
      let remaining = Number(body.p_amount)
      const selected = state.orders
        .filter((order) => body.p_order_ids.includes(order.id) && order.status === 'unpaid' && !order.deleted_at)
        .sort((a, b) => a.placed_at.localeCompare(b.placed_at))
      const allocatedByOrder = new Map<string, number>()
      for (const allocation of state.allocations) allocatedByOrder.set(allocation.order_id, (allocatedByOrder.get(allocation.order_id) ?? 0) + allocation.amount)
      const requiredTotal = selected.reduce((sum, order) => sum + order.amount - (allocatedByOrder.get(order.id) ?? 0), 0)
      if (selected.length !== body.p_order_ids.length || !Number.isSafeInteger(body.p_amount) || body.p_amount !== requiredTotal) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Payment must fully settle all selected orders' } })
        return
      }
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

    if (url.pathname === '/rest/v1/rpc/record_installment_payment' && method === 'POST') {
      const plan = state.installmentSummary.find((item) => item.id === body.p_plan_id)
      const amount = Number(body.p_amount)
      if (!plan || !Number.isSafeInteger(amount) || amount <= 0 || amount > plan.total_amount - plan.total_paid) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Contribution exceeds the remaining balance' } })
        return
      }
      const payment = { id: newId(), plan_id: plan.id, paid_at: body.p_paid_at, amount, note: body.p_note }
      state.installmentPayments.push(payment)
      plan.total_paid += amount
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/update_order' && method === 'POST') {
      const order = state.orders.find((item) => item.id === body.p_order_id)
      const allocated = state.allocations.filter((item) => item.order_id === body.p_order_id).reduce((sum, item) => sum + item.amount, 0)
      if (!order || order.deleted_at || order.status === 'cancelled' || (allocated > 0 && (order.amount !== body.p_amount || order.placed_at !== body.p_placed_at || order.billing_cycle_id !== body.p_billing_cycle_id))) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Order cannot be updated' } })
        return
      }
      Object.assign(order, { description: body.p_description, notes: body.p_notes, shopee_order_url: body.p_shopee_order_url, amount: body.p_amount, placed_at: body.p_placed_at, billing_cycle_id: body.p_billing_cycle_id })
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/soft_delete_order' && method === 'POST') {
      const order = state.orders.find((item) => item.id === body.p_order_id)
      const allocated = state.allocations.filter((item) => item.order_id === body.p_order_id).reduce((sum, item) => sum + item.amount, 0)
      const cycle = state.cycles.find((item) => item.id === order?.billing_cycle_id)
      if (!order || order.status !== 'unpaid' || allocated > 0 || order.deleted_at || cycle?.status === 'closed') {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Order cannot be deleted' } })
        return
      }
      order.deleted_at = new Date().toISOString()
      order.deleted_by = userId
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/restore_deleted_order' && method === 'POST') {
      const order = state.orders.find((item) => item.id === body.p_order_id)
      const cycle = state.cycles.find((item) => item.id === order?.billing_cycle_id)
      if (!order?.deleted_at || cycle?.status === 'closed') {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Order cannot be restored' } })
        return
      }
      order.deleted_at = null
      order.deleted_by = null
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/update_my_profile' && method === 'POST') {
      const profile = state.profiles.find((item) => item.id === userId)
      if (!profile || (body.p_avatar_path && !state.storageObjects.has(body.p_avatar_path))) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Profile or avatar object not found' } })
        return
      }
      profile.full_name = body.p_display_name
      profile.avatar_path = body.p_avatar_path
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/cancel_order' && method === 'POST') {
      const order = state.orders.find((item) => item.id === body.p_order_id)
      if (!order) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Order not found' } })
        return
      }
      if (order.status === 'paid') {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Completed Shopee orders cannot be cancelled or refunded' } })
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

    if (url.pathname === '/rest/v1/rpc/close_billing_cycle' && method === 'POST') {
      const cycle = state.cycles.find((item) => item.id === body.p_cycle_id)
      if (!cycle || cycle.status !== 'open') {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Billing cycle is not open' } })
        return
      }
      const purchases = state.orders.filter((order) => order.billing_cycle_id === cycle.id && order.status !== 'cancelled').reduce((sum, order) => sum + order.amount, 0)
      const paid = state.payments.filter((payment) => payment.paid_at >= cycle.starts_on && payment.paid_at <= cycle.ends_on).reduce((sum, payment) => sum + payment.amount, 0)
      const adjustments = state.ledgerEntries.filter((entry) => entry.billing_cycle_id === cycle.id).reduce((sum, entry) => sum + entry.amount, 0)
      const nextDate = new Date(`${cycle.ends_on}T00:00:00Z`)
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      const nextCycle = state.cycles.find((item) => item.starts_on === nextDate.toISOString().slice(0, 10))
      const snapshot: MockClosing = {
        billing_cycle_id: cycle.id,
        opening_balance: cycle.opening_balance,
        purchase_total: purchases,
        payment_total: paid,
        adjustment_total: adjustments,
        closing_balance: cycle.opening_balance + purchases - paid + adjustments,
        next_opening_before: nextCycle?.opening_balance ?? null,
      }
      state.closings = [...state.closings.filter((closing) => closing.billing_cycle_id !== cycle.id), snapshot]
      cycle.status = 'closed'
      if (nextCycle) nextCycle.opening_balance = snapshot.closing_balance
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === '/rest/v1/rpc/reopen_billing_cycle' && method === 'POST') {
      const cycle = state.cycles.find((item) => item.id === body.p_cycle_id)
      const snapshot = state.closings.find((item) => item.billing_cycle_id === body.p_cycle_id)
      if (!cycle || cycle.status !== 'closed' || !snapshot) {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Billing cycle is not closed' } })
        return
      }
      cycle.status = 'open'
      const nextDate = new Date(`${cycle.ends_on}T00:00:00Z`)
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      const nextCycle = state.cycles.find((item) => item.starts_on === nextDate.toISOString().slice(0, 10))
      if (nextCycle && snapshot.next_opening_before !== null) nextCycle.opening_balance = snapshot.next_opening_before
      state.closings = state.closings.filter((item) => item.billing_cycle_id !== cycle.id)
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

export const test = base.extend<{
  expectNoHorizontalOverflow: () => Promise<void>
  browserDialogGuard: void
}>({
  browserDialogGuard: [async ({ page }, use) => {
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type())
      await dialog.dismiss()
    })
    await use()
    expect(dialogs, 'Application interactions must use designed dialogs, not browser-native alerts').toEqual([])
  }, { auto: true }],
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
  const shortcut = page.getByTestId(role === 'admin' ? 'local-login-admin' : 'local-login-tester')
  if (await shortcut.isVisible().catch(() => false)) {
    await shortcut.click()
  } else {
    await page.getByLabel('Email').fill(role === 'admin' ? 'admin@example.test' : 'viewer@example.test')
    await page.getByRole('textbox', { name: 'Mật Khẩu' }).fill('test-password')
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
  }
  await expect(page.getByRole('button', { name: 'ShopeeLin', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tổng Quan', exact: true })).toBeVisible()
}
