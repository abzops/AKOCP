import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import type { ExpenseCategory, OrderStatus, PaymentStatus, WithdrawalReason } from '../types'

export const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
})

export function formatCurrency(value: number | null | undefined) {
  return currency.format(Number(value ?? 0))
}

export function formatDate(value?: string | null, style: 'short' | 'long' = 'short') {
  if (!value) return '—'
  const parsed = parseISO(value)
  if (!isValid(parsed)) return '—'
  return format(parsed, style === 'long' ? 'dd MMM yyyy, h:mm a' : 'dd MMM yyyy')
}

export function fromNow(value?: string | null) {
  if (!value) return '—'
  const parsed = parseISO(value)
  if (!isValid(parsed)) return '—'
  return formatDistanceToNow(parsed, { addSuffix: true })
}

export function humanize(value: string) {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export const statusLabels: Record<OrderStatus, string> = {
  inquiry: 'Inquiry',
  payment_pending: 'Payment pending',
  in_progress: 'In progress',
  completed: 'Completed',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
}

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  proof_uploaded: 'Proof uploaded',
  confirmed: 'Paid',
  refunded: 'Refunded'
}

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  meta_ads: 'Meta Ads',
  travel: 'Travel',
  food: 'Food',
  internet: 'Internet',
  equipment: 'Equipment',
  miscellaneous: 'Miscellaneous'
}

export const withdrawalReasonLabels: Record<WithdrawalReason, string> = {
  salary: 'Salary',
  profit_share: 'Profit share',
  travel: 'Travel',
  food: 'Food',
  miscellaneous: 'Miscellaneous'
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('en-IN').normalize('NFKD').trim()
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [headers.map(escape).join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function uniqueId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}
