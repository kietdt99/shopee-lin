import { describe, expect, it } from 'vitest'
import { summarizeOrderPaymentsByCycle } from '../../src/lib/orderCycleSummary'
import type { Order } from '../../src/types'

function order(overrides: Partial<Order> & Pick<Order, 'id' | 'amount' | 'status' | 'billing_cycle_id'>): Order {
  return {
    description: overrides.id,
    placed_at: '2026-05-01',
    shopee_order_url: null,
    notes: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  }
}

describe('summarizeOrderPaymentsByCycle', () => {
  const orders = [
    order({ id: 'june-unpaid', amount: 1_000, status: 'unpaid', billing_cycle_id: 'june' }),
    order({ id: 'june-paid', amount: 500, status: 'paid', billing_cycle_id: 'june' }),
    order({ id: 'may-unpaid', amount: 2_000, status: 'unpaid', billing_cycle_id: 'may' }),
    order({ id: 'april-unpaid', amount: 800, status: 'unpaid', billing_cycle_id: 'april' }),
    order({ id: 'deleted', amount: 900, status: 'unpaid', billing_cycle_id: 'june', deleted_at: '2026-06-01' }),
    order({ id: 'cancelled', amount: 700, status: 'cancelled', billing_cycle_id: 'june' }),
  ]
  const allocations = [
    { order_id: 'june-unpaid', amount: 250 },
    { order_id: 'june-paid', amount: 500 },
    { order_id: 'may-unpaid', amount: 100 },
    { order_id: 'april-unpaid', amount: 300 },
    { order_id: 'deleted', amount: 900 },
    { order_id: 'cancelled', amount: 700 },
  ]

  it('counts active allocations and unpaid remainder only in the selected cycle', () => {
    expect(summarizeOrderPaymentsByCycle(orders, allocations, ['june'])).toEqual({
      paidAmount: 750,
      unpaidAmount: 750,
    })
  })

  it('treats an empty or missing cycle selection as all cycles', () => {
    const expected = { paidAmount: 1_150, unpaidAmount: 3_150 }
    expect(summarizeOrderPaymentsByCycle(orders, allocations, [])).toEqual(expected)
    expect(summarizeOrderPaymentsByCycle(orders, allocations, null)).toEqual(expected)
  })

  it('combines totals for multiple selected cycles', () => {
    expect(summarizeOrderPaymentsByCycle(orders, allocations, ['june', 'may'])).toEqual({
      paidAmount: 850,
      unpaidAmount: 2_650,
    })
  })

  it('keeps VND integer totals and clamps an over-allocated unpaid order at zero', () => {
    const overAllocated = order({ id: 'over', amount: 100, status: 'unpaid', billing_cycle_id: 'june' })
    const summary = summarizeOrderPaymentsByCycle([overAllocated], [{ order_id: 'over', amount: 150 }], ['june'])
    expect(summary).toEqual({ paidAmount: 150, unpaidAmount: 0 })
    expect(Number.isInteger(summary.paidAmount)).toBe(true)
    expect(Number.isInteger(summary.unpaidAmount)).toBe(true)
  })

  it('returns zero totals for a selected cycle with no active orders', () => {
    expect(summarizeOrderPaymentsByCycle(orders, allocations, ['missing'])).toEqual({
      paidAmount: 0,
      unpaidAmount: 0,
    })
  })
})
