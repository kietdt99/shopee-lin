import type { Order } from '../types'

export type OrderPaymentAllocation = {
  order_id: string
  amount: number
}

export type OrderCyclePaymentSummary = {
  paidAmount: number
  unpaidAmount: number
}

/**
 * Summarizes order-cycle debt independently from the visible search/status results.
 * An empty cycle selection means every billing cycle. Cancelled and soft-deleted
 * orders are history only and must not contribute to either total.
 */
export function summarizeOrderPaymentsByCycle(
  orders: Order[],
  allocations: OrderPaymentAllocation[],
  selectedCycleIds: readonly string[] | null,
): OrderCyclePaymentSummary {
  const selectedCycles = selectedCycleIds?.length ? new Set(selectedCycleIds) : null
  const allocatedByOrderId = new Map<string, number>()

  for (const allocation of allocations) {
    allocatedByOrderId.set(
      allocation.order_id,
      (allocatedByOrderId.get(allocation.order_id) ?? 0) + allocation.amount,
    )
  }

  let paidAmount = 0
  let unpaidAmount = 0

  for (const order of orders) {
    if (order.deleted_at || order.status === 'cancelled') continue
    if (selectedCycles && !selectedCycles.has(order.billing_cycle_id ?? '')) continue

    const allocatedAmount = allocatedByOrderId.get(order.id) ?? 0
    paidAmount += allocatedAmount

    if (order.status === 'unpaid') {
      unpaidAmount += Math.max(0, order.amount - allocatedAmount)
    }
  }

  return { paidAmount, unpaidAmount }
}
