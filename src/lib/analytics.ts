import { endOfMonth, endOfWeek, isAfter, isSameDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import type { AppSnapshot, DashboardMetrics } from '../types'

const confirmedRevenue = (snapshot: AppSnapshot) => snapshot.walletTransactions.filter((transaction) => transaction.type === 'payment')

export function getDashboardMetrics(snapshot: AppSnapshot): DashboardMetrics {
  const now = new Date()
  const revenueTransactions = confirmedRevenue(snapshot)
  const revenueToday = revenueTransactions.filter((transaction) => isSameDay(new Date(transaction.created_at), now)).reduce((sum, transaction) => sum + transaction.amount, 0)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const revenueWeek = revenueTransactions.filter((transaction) => {
    const date = new Date(transaction.created_at)
    return date >= weekStart && date <= weekEnd
  }).reduce((sum, transaction) => sum + transaction.amount, 0)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const revenueMonth = revenueTransactions.filter((transaction) => {
    const date = new Date(transaction.created_at)
    return date >= monthStart && date <= monthEnd
  }).reduce((sum, transaction) => sum + transaction.amount, 0)
  const totalRevenue = revenueTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
  const totalExpenses = snapshot.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const approvedWithdrawals = snapshot.withdrawals.filter((withdrawal) => withdrawal.status === 'approved').reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
  const activeStatuses = new Set(['inquiry', 'payment_pending', 'in_progress'])
  const newCustomerBoundary = subMonths(now, 1)
  const recordedSales = (snapshot.recordedSales ?? []).filter((order) => order.verified)
  const recordedDates = recordedSales.map((order) => order.record_date).sort()
  const contactKey = (phone?: string | null, name?: string | null) => phone || name?.trim().toLowerCase()
  const allContacts = new Set([
    ...snapshot.customers.map((customer) => contactKey(customer.phone, customer.name)),
    ...recordedSales.map((sale) => contactKey(sale.phone, sale.contact_name))
  ].filter(Boolean))
  const newContacts = new Set([
    ...snapshot.customers.filter((customer) => isAfter(new Date(customer.created_at), newCustomerBoundary)).map((customer) => contactKey(customer.phone, customer.name)),
    ...recordedSales.filter((sale) => isAfter(new Date(`${sale.record_date}T12:00:00`), newCustomerBoundary)).map((sale) => contactKey(sale.phone, sale.contact_name))
  ].filter(Boolean))
  return {
    revenueToday,
    revenueWeek,
    revenueMonth,
    totalRevenue,
    walletBalance: totalRevenue - totalExpenses - approvedWithdrawals,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    activeOrders: snapshot.orders.filter((order) => activeStatuses.has(order.status)).length,
    pendingOrders: snapshot.orders.filter((order) => ['inquiry', 'payment_pending'].includes(order.status)).length,
    completedOrders: snapshot.orders.filter((order) => ['completed', 'delivered'].includes(order.status)).length,
    completedToday: snapshot.orders.filter((order) => order.completed_at && isSameDay(new Date(order.completed_at), now)).length,
    pendingWithdrawals: snapshot.withdrawals.filter((withdrawal) => withdrawal.status === 'pending').length,
    totalInventory: snapshot.inventorySummary.totalAssets,
    totalCustomers: allContacts.size,
    adSpend: snapshot.expenses.filter((expense) => expense.category === 'meta_ads').reduce((sum, expense) => sum + expense.amount, 0),
    newCustomers: newContacts.size,
    recordedSaleCount: recordedSales.length,
    recordedSalesTotal: recordedSales.reduce((sum, sale) => sum + sale.quoted_amount, 0),
    recordedContactCount: new Set(recordedSales.map((sale) => contactKey(sale.phone, sale.contact_name)).filter(Boolean)).size,
    recordedFirstDate: recordedDates[0],
    recordedLastDate: recordedDates.at(-1)
  }
}

export function getMonthlyRevenue(snapshot: AppSnapshot, months = 6) {
  const now = new Date()
  return Array.from({ length: months }, (_, index) => {
    const date = subMonths(now, months - index - 1)
    const start = startOfMonth(date)
    const end = endOfMonth(date)
    const revenue = confirmedRevenue(snapshot)
      .filter((transaction) => {
        const transactionDate = new Date(transaction.created_at)
        return transactionDate >= start && transactionDate <= end
      })
      .reduce((sum, transaction) => sum + transaction.amount, 0)
    return { month: date.toLocaleString('en-IN', { month: 'short' }), revenue }
  })
}

export function getServiceRevenue(snapshot: AppSnapshot) {
  const serviceRevenue = snapshot.services.map((service) => {
    const orders = snapshot.orders.filter((order) => order.service_id === service.id && order.payment_status === 'confirmed')
    return {
      name: service.code,
      label: service.name,
      revenue: orders.reduce((sum, order) => sum + order.price, 0),
      orders: orders.length
    }
  })
  const recordedSales = (snapshot.recordedSales ?? []).filter((sale) => sale.verified)
  if (recordedSales.length) {
    serviceRevenue.push({
      name: 'REC',
      label: 'Owner-recorded sales',
      revenue: recordedSales.reduce((sum, sale) => sum + sale.quoted_amount, 0),
      orders: recordedSales.length
    })
  }
  return serviceRevenue
}

export function getLanguageOrders(snapshot: AppSnapshot) {
  const counts = new Map<string, number>()
  snapshot.orders.filter((order) => order.status !== 'cancelled').forEach((order) => counts.set(order.language, (counts.get(order.language) ?? 0) + 1))
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function getExpenseBreakdown(snapshot: AppSnapshot) {
  const counts = new Map<string, number>()
  snapshot.expenses.forEach((expense) => counts.set(expense.category, (counts.get(expense.category) ?? 0) + expense.amount))
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}
