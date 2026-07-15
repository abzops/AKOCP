import { endOfMonth, endOfWeek, isAfter, isSameDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import type { AppSnapshot, DashboardMetrics } from '../types'

const confirmedRevenue = (snapshot: AppSnapshot) => snapshot.payments.filter((payment) => payment.status === 'confirmed')

export function getDashboardMetrics(snapshot: AppSnapshot): DashboardMetrics {
  const now = new Date()
  const payments = confirmedRevenue(snapshot)
  const revenueToday = payments.filter((payment) => isSameDay(new Date(payment.confirmed_at ?? payment.created_at), now)).reduce((sum, payment) => sum + payment.amount, 0)
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const revenueWeek = payments.filter((payment) => {
    const date = new Date(payment.confirmed_at ?? payment.created_at)
    return date >= weekStart && date <= weekEnd
  }).reduce((sum, payment) => sum + payment.amount, 0)
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const revenueMonth = payments.filter((payment) => {
    const date = new Date(payment.confirmed_at ?? payment.created_at)
    return date >= monthStart && date <= monthEnd
  }).reduce((sum, payment) => sum + payment.amount, 0)
  const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const totalExpenses = snapshot.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const approvedWithdrawals = snapshot.withdrawals.filter((withdrawal) => withdrawal.status === 'approved').reduce((sum, withdrawal) => sum + withdrawal.amount, 0)
  const activeStatuses = new Set(['inquiry', 'payment_pending', 'in_progress'])
  const newCustomerBoundary = subMonths(now, 1)
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
    totalInventory: snapshot.tracks.length,
    totalCustomers: snapshot.customers.length,
    adSpend: snapshot.expenses.filter((expense) => expense.category === 'meta_ads').reduce((sum, expense) => sum + expense.amount, 0),
    newCustomers: snapshot.customers.filter((customer) => isAfter(new Date(customer.created_at), newCustomerBoundary)).length
  }
}

export function getMonthlyRevenue(snapshot: AppSnapshot, months = 6) {
  const now = new Date()
  return Array.from({ length: months }, (_, index) => {
    const date = subMonths(now, months - index - 1)
    const start = startOfMonth(date)
    const end = endOfMonth(date)
    const revenue = confirmedRevenue(snapshot)
      .filter((payment) => {
        const paymentDate = new Date(payment.confirmed_at ?? payment.created_at)
        return paymentDate >= start && paymentDate <= end
      })
      .reduce((sum, payment) => sum + payment.amount, 0)
    return { month: date.toLocaleString('en-IN', { month: 'short' }), revenue }
  })
}

export function getServiceRevenue(snapshot: AppSnapshot) {
  return snapshot.services.map((service) => {
    const orders = snapshot.orders.filter((order) => order.service_id === service.id && order.payment_status === 'confirmed')
    return {
      name: service.code,
      label: service.name,
      revenue: orders.reduce((sum, order) => sum + order.price, 0),
      orders: orders.length
    }
  })
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
