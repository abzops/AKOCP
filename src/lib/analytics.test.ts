import { describe, expect, it } from 'vitest'
import type { AppSnapshot, Service } from '../types'
import { getDashboardMetrics, getServiceRevenue } from './analytics'

const now = '2026-07-15T08:00:00.000Z'
const services: Service[] = ['AU150', 'EX250', 'ML350', 'OL450'].map((code, index) => ({
  id: `service-${index + 1}`,
  code,
  name: `${code} service`,
  price: [150, 250, 350, 450][index],
  active: true,
  sort_order: index + 1,
  created_at: now,
  updated_at: now,
}))

function createSnapshot(): AppSnapshot {
  return {
    services,
    profiles: [],
    customers: [],
    tracks: [],
    orders: [{
      id: 'order-1',
      order_number: 'AK-260715-001',
      customer_id: 'customer-1',
      service_id: services[1].id,
      track_name: 'Test Track',
      language: 'Malayalam',
      status: 'delivered',
      payment_status: 'confirmed',
      price: services[1].price,
      created_by: 'founder-1',
      created_at: now,
      updated_at: now,
    }],
    legacyOrders: [
      { id: 'legacy-1', source_ref: 'owner-2026-07-06-01', record_date: '2026-07-06', phone: '9037922963', quoted_amount: 150, currency: 'INR', fulfillment_hint: 'audio', raw_note: 'audio', created_at: now },
      { id: 'legacy-2', source_ref: 'owner-2026-07-07-01', record_date: '2026-07-07', contact_name: 'Abdul Saleem', quoted_amount: 1_000, currency: 'INR', fulfillment_hint: 'unspecified', created_at: now },
    ],
    payments: [
      { id: 'payment-1', order_id: 'order-1', amount: 1_000, status: 'confirmed', uploaded_by: 'founder-1', confirmed_at: now, created_at: now },
      { id: 'payment-2', order_id: 'order-2', amount: 250, status: 'pending', uploaded_by: 'operations-1', created_at: now },
    ],
    expenses: [{ id: 'expense-1', amount: 200, category: 'internet', description: 'Connection', expense_date: '2026-07-15', added_by: 'founder-1', created_at: now }],
    withdrawals: [
      { id: 'withdrawal-1', requested_by: 'operations-1', amount: 100, reason: 'salary', status: 'approved', created_at: now },
      { id: 'withdrawal-2', requested_by: 'operations-1', amount: 50, reason: 'travel', status: 'pending', created_at: now },
    ],
    notifications: [],
    auditLogs: [],
    walletTransactions: [],
    syncedAt: now,
  }
}

describe('business analytics', () => {
  it('derives the wallet from confirmed revenue, expenses, and approved withdrawals', () => {
    const snapshot = createSnapshot()
    const metrics = getDashboardMetrics(snapshot)
    const confirmedRevenue = snapshot.payments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + payment.amount, 0)
    const expenses = snapshot.expenses.reduce((sum, expense) => sum + expense.amount, 0)
    const withdrawals = snapshot.withdrawals.filter((withdrawal) => withdrawal.status === 'approved').reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
    expect(metrics.totalRevenue).toBe(confirmedRevenue)
    expect(metrics.walletBalance).toBe(confirmedRevenue - expenses - withdrawals)
    expect(metrics.netProfit).toBe(confirmedRevenue - expenses)
    expect(metrics.legacyRecordCount).toBe(2)
    expect(metrics.legacyQuotedTotal).toBe(1_150)
    expect(metrics.legacyContactCount).toBe(2)
  })

  it('groups paid orders by controlled service', () => {
    const snapshot = createSnapshot()
    const groups = getServiceRevenue(snapshot)
    expect(groups).toHaveLength(4)
    expect(groups.find((group) => group.name === 'EX250')?.orders).toBeGreaterThan(0)
    expect(groups.every((group) => group.revenue >= 0)).toBe(true)
  })
})
