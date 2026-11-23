import { describe, expect, it } from 'vitest'
import { billingCycleLabel, billingCycleRange } from '../../src/lib/billingCycle'
import { orderFilterStatus, sortOrders, type OrderSortKey } from '../../src/lib/orderSort'
import { parseVndInput } from '../../src/lib/vnd'
import type { Order } from '../../src/types'

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    placed_at: '2026-06-01',
    description: id,
    shopee_order_url: null,
    amount: 1000,
    status: 'unpaid',
    billing_cycle_id: null,
    deleted_at: null,
    ...overrides,
  }
}

describe('billing-cycle helpers', () => {
  it('assigns dates on the 20th and 21st to adjacent cycles', () => {
    expect(billingCycleLabel('2026-05-20')).toBe('05.2026')
    expect(billingCycleLabel('2026-05-21')).toBe('06.2026')
  })

  it('rolls the 21st of December into January of the next year', () => {
    expect(billingCycleLabel('2026-12-20')).toBe('12.2026')
    expect(billingCycleLabel('2026-12-21')).toBe('01.2027')
  })

  it('returns cycle ranges across month and year boundaries', () => {
    expect(billingCycleRange('06.2026')).toEqual({ starts_on: '2026-05-21', ends_on: '2026-06-20' })
    expect(billingCycleRange('01.2027')).toEqual({ starts_on: '2026-12-21', ends_on: '2027-01-20' })
  })
})

describe('VND input parsing', () => {
  it.each([
    ['78850', 78850],
    [' 1.234.567 ', 1_234_567],
    ['1,234,567', 1_234_567],
    ['0', 0],
  ])('parses %s as a whole-VND integer', (value, expected) => {
    expect(parseVndInput(value)).toBe(expected)
  })

  it.each(['', '1.5', '12,34', '1.23.456', '9007199254740992'])('rejects invalid or unsafe amount %s', (value) => {
    expect(parseVndInput(value)).toBeNull()
  })
})

describe('order status and sorting', () => {
  it('derives deleted status before cancelled and paid status', () => {
    expect(orderFilterStatus(makeOrder('deleted', { status: 'paid', deleted_at: '2026-06-02T00:00:00Z' }))).toBe('deleted')
    expect(orderFilterStatus(makeOrder('cancelled', { status: 'cancelled' }))).toBe('cancelled')
    expect(orderFilterStatus(makeOrder('paid', { status: 'paid' }))).toBe('paid')
    expect(orderFilterStatus(makeOrder('unpaid'))).toBe('unpaid')
  })

  it('sorts unpaid, paid, cancelled, then deleted statuses', () => {
    const orders = [
      makeOrder('deleted', { deleted_at: '2026-06-02T00:00:00Z' }),
      makeOrder('paid', { status: 'paid' }),
      makeOrder('cancelled', { status: 'cancelled' }),
      makeOrder('unpaid'),
    ]

    expect(sortOrders(orders, 'status', 'asc', new Map()).map((order) => order.id))
      .toEqual(['unpaid', 'paid', 'cancelled', 'deleted'])
  })

  it.each(['asc', 'desc'] as const)('keeps missing cycles last with %s cycle sort', (direction) => {
    const orders = [
      makeOrder('no-cycle'),
      makeOrder('may', { billing_cycle_id: 'may' }),
      makeOrder('unknown-cycle', { billing_cycle_id: 'unknown' }),
      makeOrder('june', { billing_cycle_id: 'june' }),
    ]
    const cycleStartById = new Map([['may', '2026-04-21'], ['june', '2026-05-21']])
    const expectedKnownOrder = direction === 'asc' ? ['may', 'june'] : ['june', 'may']

    expect(sortOrders(orders, 'cycle', direction, cycleStartById).map((order) => order.id))
      .toEqual([...expectedKnownOrder, 'no-cycle', 'unknown-cycle'])
  })

  it.each(['date', 'amount', 'cycle', 'status'] as const satisfies readonly OrderSortKey[])(
    'preserves input order for stable %s ties',
    (key) => {
      const first = makeOrder('first', { billing_cycle_id: 'cycle' })
      const second = makeOrder('second', { billing_cycle_id: 'cycle' })
      const cycleStartById = new Map([['cycle', '2026-05-21']])

      expect(sortOrders([first, second], key, 'asc', cycleStartById).map((order) => order.id))
        .toEqual(['first', 'second'])
      expect(sortOrders([first, second], key, 'desc', cycleStartById).map((order) => order.id))
        .toEqual(['first', 'second'])
    },
  )

  it('returns the original list unchanged when no sort key is selected', () => {
    const orders = [makeOrder('first'), makeOrder('second')]

    expect(sortOrders(orders, null, 'asc', new Map())).toBe(orders)
  })
})
