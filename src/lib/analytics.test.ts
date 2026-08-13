import { describe, expect, it } from 'vitest'
import type { AppSnapshot, Service } from '../types'
import { getDashboardMetrics, getFinanceOutflowAnalysis, getMonthlyTargetForecast, getServiceRevenue } from './analytics'

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
    inventorySummary: { totalAssets: 0, totalRevenue: 0, reusedAssets: 0, topTrack: null, languages: [] },
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
    recordedSales: [
      { id: 'legacy-1', source_ref: 'owner-2026-07-06-01', record_date: '2026-07-06', phone: '9037922963', quoted_amount: 150, currency: 'INR', fulfillment_hint: 'audio', raw_note: 'audio', verified: true, verified_at: now, created_at: now },
      { id: 'legacy-2', source_ref: 'owner-2026-07-07-01', record_date: '2026-07-07', contact_name: 'Abdul Saleem', quoted_amount: 1_000, currency: 'INR', fulfillment_hint: 'unspecified', verified: true, verified_at: now, created_at: now },
    ],
    payments: [
      { id: 'payment-1', order_id: 'order-1', amount: 1_000, status: 'confirmed', uploaded_by: 'founder-1', confirmed_at: now, created_at: now },
      { id: 'payment-2', order_id: 'order-2', amount: 250, status: 'pending', uploaded_by: 'operations-1', created_at: now },
    ],
    expenses: [{ id: 'expense-1', amount: 200, category: 'internet', description: 'Connection', expense_date: '2026-07-15', added_by: 'founder-1', status: 'approved', created_at: now }],
    withdrawals: [
      { id: 'withdrawal-1', requested_by: 'operations-1', amount: 100, reason: 'salary', status: 'approved', created_at: now },
      { id: 'withdrawal-2', requested_by: 'operations-1', amount: 50, reason: 'travel', status: 'pending', created_at: now },
    ],
    notifications: [],
    auditLogs: [],
    walletTransactions: [
      { id: 'transaction-1', type: 'payment', amount: 1_000, reference_type: 'payment', reference_id: 'payment-1', description: 'Confirmed payment', created_at: now },
      { id: 'transaction-2', type: 'payment', amount: 150, reference_type: 'recorded_sale', reference_id: 'legacy-1', description: 'Recorded sale', created_at: '2026-07-06T12:00:00.000Z' },
      { id: 'transaction-3', type: 'payment', amount: 1_000, reference_type: 'recorded_sale', reference_id: 'legacy-2', description: 'Recorded sale', created_at: '2026-07-07T12:00:00.000Z' },
    ],
    monthlyTarget: null,
    syncedAt: now,
  }
}

describe('business analytics', () => {
  it('derives the wallet from confirmed revenue, expenses, and approved withdrawals', () => {
    const snapshot = createSnapshot()
    const metrics = getDashboardMetrics(snapshot)
    const confirmedRevenue = snapshot.walletTransactions.filter((transaction) => transaction.type === 'payment').reduce((sum, transaction) => sum + transaction.amount, 0)
    const expenses = snapshot.expenses.reduce((sum, expense) => sum + expense.amount, 0)
    const withdrawals = snapshot.withdrawals.filter((withdrawal) => withdrawal.status === 'approved').reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
    expect(metrics.totalRevenue).toBe(confirmedRevenue)
    expect(metrics.walletBalance).toBe(confirmedRevenue - expenses - withdrawals)
    expect(metrics.netProfit).toBe(confirmedRevenue - expenses)
    expect(metrics.recordedSaleCount).toBe(2)
    expect(metrics.recordedSalesTotal).toBe(1_150)
    expect(metrics.recordedContactCount).toBe(2)
  })

  it('keeps pending and rejected expenses out of wallet and profit totals', () => {
    const snapshot = createSnapshot()
    snapshot.expenses.push(
      { ...snapshot.expenses[0], id: 'expense-pending', amount: 900, status: 'pending' },
      { ...snapshot.expenses[0], id: 'expense-rejected', amount: 700, status: 'rejected' }
    )
    const metrics = getDashboardMetrics(snapshot)
    expect(metrics.totalExpenses).toBe(200)
    expect(metrics.netProfit).toBe(metrics.totalRevenue - 200)
  })

  it('groups paid orders by controlled service', () => {
    const snapshot = createSnapshot()
    const groups = getServiceRevenue(snapshot)
    expect(groups).toHaveLength(5)
    expect(groups.find((group) => group.name === 'EX250')?.orders).toBeGreaterThan(0)
    expect(groups.find((group) => group.name === 'REC')?.revenue).toBe(1_150)
    expect(groups.every((group) => group.revenue >= 0)).toBe(true)
  })

  it('groups approved withdrawals by person and purpose without counting pending requests', () => {
    const snapshot = createSnapshot()
    snapshot.withdrawals[0].requester = { id: 'operations-1', full_name: 'Roshan' }
    const result = getFinanceOutflowAnalysis(snapshot)
    expect(result.withdrawalTotal).toBe(100)
    expect(result.pendingWithdrawalTotal).toBe(50)
    expect(result.byPerson).toEqual([{ id: 'operations-1', name: 'Roshan', total: 100, count: 1 }])
    expect(result.byPurpose[0]).toMatchObject({ purpose: 'salary', total: 100 })
  })

  it('calculates the inclusive daily amount needed for a monthly target', () => {
    const snapshot = createSnapshot()
    snapshot.monthlyTarget = { month_start: '2026-07-01', target_amount: 3_100, updated_by: 'founder-1', updated_at: now }
    const result = getMonthlyTargetForecast(snapshot, new Date('2026-07-15T08:00:00.000Z'))
    expect(result.earned).toBe(2_150)
    expect(result.daysRemaining).toBe(17)
    expect(result.dailyRequired).toBe(56)
    expect(result.projectedMonthEnd).toBeCloseTo(4_443.33, 1)
  })
})
