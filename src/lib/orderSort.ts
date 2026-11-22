import type { Order } from '../types'

export type OrderFilterStatus = 'unpaid' | 'paid' | 'cancelled' | 'deleted'
export type OrderSortKey = 'date' | 'amount' | 'cycle' | 'status'
export type OrderSortDirection = 'asc' | 'desc'

const orderStatusSortOrder: Record<OrderFilterStatus, number> = {
  unpaid: 0,
  paid: 1,
  cancelled: 2,
  deleted: 3,
}

export function orderFilterStatus(order: Order): OrderFilterStatus {
  if (order.deleted_at) return 'deleted'
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status === 'paid') return 'paid'
  return 'unpaid'
}

function compareOrderValues(left: Order, right: Order, key: OrderSortKey, cycleStartById: Map<string, string>) {
  switch (key) {
    case 'date':
      return left.placed_at.localeCompare(right.placed_at)
    case 'amount':
      return left.amount - right.amount
    case 'cycle': {
      const leftCycleStart = left.billing_cycle_id ? cycleStartById.get(left.billing_cycle_id) : undefined
      const rightCycleStart = right.billing_cycle_id ? cycleStartById.get(right.billing_cycle_id) : undefined
      if (leftCycleStart === undefined || rightCycleStart === undefined) {
        if (leftCycleStart !== rightCycleStart) return leftCycleStart === undefined ? 1 : -1
        return 0
      }
      return leftCycleStart.localeCompare(rightCycleStart)
    }
    case 'status':
      return orderStatusSortOrder[orderFilterStatus(left)] - orderStatusSortOrder[orderFilterStatus(right)]
  }
}

export function sortOrders(
  orders: Order[],
  key: OrderSortKey | null,
  direction: OrderSortDirection,
  cycleStartById: Map<string, string>,
): Order[] {
  if (key === null) return orders

  const directionMultiplier = direction === 'asc' ? 1 : -1
  return orders.map((order, index) => ({ order, index })).sort((left, right) => {
    if (key === 'cycle') {
      const leftHasCycleDate = left.order.billing_cycle_id !== null && cycleStartById.has(left.order.billing_cycle_id)
      const rightHasCycleDate = right.order.billing_cycle_id !== null && cycleStartById.has(right.order.billing_cycle_id)
      if (leftHasCycleDate !== rightHasCycleDate) return leftHasCycleDate ? -1 : 1
    }

    const comparison = compareOrderValues(left.order, right.order, key, cycleStartById)
    if (comparison === 0) return left.index - right.index
    return comparison * directionMultiplier
  }).map(({ order }) => order)
}
