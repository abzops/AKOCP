import type { Order, OrderStatus } from '../types'

export const workflowColumns: OrderStatus[] = ['inquiry', 'payment_pending', 'in_progress', 'completed', 'delivered', 'cancelled']

// Match order-detail actions. Completion always opens the inventory workflow.
export function workflowTargets(order: Order): OrderStatus[] {
  if (order.status === 'delivered' || order.status === 'cancelled') return []
  if (order.status === 'completed') return ['delivered']
  const targets: OrderStatus[] = []
  if (order.status === 'inquiry') targets.push('payment_pending')
  if (order.payment_status === 'confirmed') {
    if (order.status === 'inquiry' || order.status === 'payment_pending') targets.push('in_progress')
    if (order.status === 'in_progress') targets.push('completed')
  }
  return [...targets, 'cancelled']
}

export function workflowMoveError(order: Order, target: OrderStatus): string | null {
  if (target === order.status) return 'This order is already in that stage.'
  if (workflowTargets(order).includes(target)) return null
  if (['delivered', 'cancelled'].includes(order.status)) return 'Finalized orders cannot change stage.'
  if (['in_progress', 'completed'].includes(target) && order.payment_status !== 'confirmed') return 'Confirm payment before starting or completing production.'
  if (target === 'delivered') return 'Complete the order before marking it delivered.'
  return 'Follow the next stage shown in the order actions.'
}
