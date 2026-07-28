import type { AppSnapshot, CreateOrderInput, CreateTrackInput, CustomerPurgePreview, CustomerPurgeResult, DataService, ExpenseCategory, InventoryPageResult, InventoryQuery, InventorySummary, InventoryTrack, Order, OrderStatus, Profile, RefreshDomain, Role, Service, WithdrawalReason } from '../types'
import { normalizeSupabaseError, supabase } from './supabase'

const INVENTORY_PAGE_SIZE = 50

const emptyInventorySummary: InventorySummary = {
  totalAssets: 0,
  totalRevenue: 0,
  reusedAssets: 0,
  topTrack: null,
  languages: []
}

export function parseInventorySummary(value: unknown): InventorySummary {
  if (!value || typeof value !== 'object') return emptyInventorySummary
  const data = value as Record<string, unknown>
  return {
    totalAssets: Number(data.totalAssets ?? 0),
    totalRevenue: Number(data.totalRevenue ?? 0),
    reusedAssets: Number(data.reusedAssets ?? 0),
    topTrack: data.topTrack as InventorySummary['topTrack'] ?? null,
    languages: Array.isArray(data.languages) ? data.languages.map(String) : []
  }
}

export function inventoryCursorValue(track: InventoryTrack, sort: NonNullable<InventoryQuery['sort']>) {
  if (sort === 'orders') return String(track.total_orders)
  if (sort === 'revenue') return String(track.lifetime_revenue)
  if (sort === 'name') return track.track_name.toLowerCase()
  return track.created_at
}

async function upload(bucket: 'payment-proofs' | 'expense-receipts', file: File | null, actor: Profile) {
  if (!file) return null
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${actor.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw normalizeSupabaseError(error)
  return path
}

function assertNoError(error: unknown) {
  if (error) throw normalizeSupabaseError(error)
}

export const supabaseDataService: DataService = {
  async loadSnapshot(userId: string) {
    const [services, profiles, customers, inventorySummary, orders, recordedSales, payments, expenses, withdrawals, notifications, audits, transactions] = await Promise.all([
      supabase.from('services').select('*').order('sort_order'),
      supabase.from('profiles').select('*').eq('active', true).order('full_name'),
      supabase.from('customers').select('*').is('deleted_at', null).order('last_ordered_at', { ascending: false, nullsFirst: false }),
      supabase.rpc('inventory_summary'),
      supabase.from('orders').select('*, customer:customers(id,name,phone), service:services(id,code,name,price), assignee:profiles!orders_assigned_to_fkey(id,full_name)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('recorded_sales').select('*').order('record_date', { ascending: false }).order('source_ref', { ascending: false }),
      supabase.from('payments').select('*').order('created_at', { ascending: false }),
      supabase.from('expenses').select('*, creator:profiles!expenses_added_by_fkey(id,full_name)').is('deleted_at', null).order('expense_date', { ascending: false }),
      supabase.from('withdrawals').select('*, requester:profiles!withdrawals_requested_by_fkey(id,full_name), approver:profiles!withdrawals_approved_by_fkey(id,full_name)').order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('recipient_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('audit_logs').select('*, actor:profiles!audit_logs_actor_id_fkey(id,full_name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false })
    ])
    const error = [services, profiles, customers, inventorySummary, orders, recordedSales, payments, expenses, withdrawals, notifications, audits, transactions].find((result) => result.error)?.error
    assertNoError(error)
    return {
      services: services.data ?? [],
      profiles: profiles.data ?? [],
      customers: customers.data ?? [],
      inventorySummary: parseInventorySummary(inventorySummary.data),
      orders: (orders.data ?? []) as unknown as AppSnapshot['orders'],
      recordedSales: (recordedSales.data ?? []) as AppSnapshot['recordedSales'],
      payments: payments.data ?? [],
      expenses: (expenses.data ?? []) as unknown as AppSnapshot['expenses'],
      withdrawals: (withdrawals.data ?? []) as unknown as AppSnapshot['withdrawals'],
      notifications: notifications.data ?? [],
      auditLogs: (audits.data ?? []) as unknown as AppSnapshot['auditLogs'],
      walletTransactions: transactions.data ?? [],
      syncedAt: new Date().toISOString()
    } as AppSnapshot
  },

  async loadDomains(snapshot: AppSnapshot, userId: string, domains: RefreshDomain[]) {
    const requested = new Set(domains)
    const next: AppSnapshot = { ...snapshot, syncedAt: new Date().toISOString() }
    const tasks: Promise<void>[] = []

    if (requested.has('services')) tasks.push((async () => {
      const result = await supabase.from('services').select('*').order('sort_order')
      assertNoError(result.error); next.services = result.data ?? []
    })())
    if (requested.has('profiles')) tasks.push((async () => {
      const result = await supabase.from('profiles').select('*').eq('active', true).order('full_name')
      assertNoError(result.error); next.profiles = result.data ?? []
    })())
    if (requested.has('customers')) tasks.push((async () => {
      const result = await supabase.from('customers').select('*').is('deleted_at', null).order('last_ordered_at', { ascending: false, nullsFirst: false })
      assertNoError(result.error); next.customers = result.data ?? []
    })())
    if (requested.has('inventory')) tasks.push((async () => {
      const result = await supabase.rpc('inventory_summary')
      assertNoError(result.error); next.inventorySummary = parseInventorySummary(result.data)
    })())
    if (requested.has('orders')) tasks.push((async () => {
      const result = await supabase.from('orders').select('*, customer:customers(id,name,phone), service:services(id,code,name,price), assignee:profiles!orders_assigned_to_fkey(id,full_name)').is('deleted_at', null).order('created_at', { ascending: false })
      assertNoError(result.error); next.orders = (result.data ?? []) as unknown as AppSnapshot['orders']
    })())
    if (requested.has('payments')) tasks.push((async () => {
      const result = await supabase.from('payments').select('*').order('created_at', { ascending: false })
      assertNoError(result.error); next.payments = result.data ?? []
    })())
    if (requested.has('recordedSales')) tasks.push((async () => {
      const result = await supabase.from('recorded_sales').select('*').order('record_date', { ascending: false }).order('source_ref', { ascending: false })
      assertNoError(result.error); next.recordedSales = (result.data ?? []) as AppSnapshot['recordedSales']
    })())
    if (requested.has('finance')) tasks.push((async () => {
      const [expenses, withdrawals, transactions] = await Promise.all([
        supabase.from('expenses').select('*, creator:profiles!expenses_added_by_fkey(id,full_name)').is('deleted_at', null).order('expense_date', { ascending: false }),
        supabase.from('withdrawals').select('*, requester:profiles!withdrawals_requested_by_fkey(id,full_name), approver:profiles!withdrawals_approved_by_fkey(id,full_name)').order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false })
      ])
      assertNoError(expenses.error || withdrawals.error || transactions.error)
      next.expenses = (expenses.data ?? []) as unknown as AppSnapshot['expenses']
      next.withdrawals = (withdrawals.data ?? []) as unknown as AppSnapshot['withdrawals']
      next.walletTransactions = transactions.data ?? []
    })())
    if (requested.has('notifications')) tasks.push((async () => {
      const result = await supabase.from('notifications').select('*').eq('recipient_id', userId).order('created_at', { ascending: false }).limit(50)
      assertNoError(result.error); next.notifications = result.data ?? []
    })())

    await Promise.all(tasks)
    return next
  },

  async getInventorySummary() {
    const { data, error } = await supabase.rpc('inventory_summary')
    assertNoError(error)
    return parseInventorySummary(data)
  },

  async searchInventory(input: InventoryQuery): Promise<InventoryPageResult> {
    const sort = input.sort ?? 'orders'
    let cursorValue: string | null = null
    let cursorId: string | null = null
    if (input.cursor) {
      try {
        const cursor = JSON.parse(input.cursor) as { value?: string; id?: string }
        cursorValue = cursor.value ?? null
        cursorId = cursor.id ?? null
      } catch {
        throw new Error('Invalid inventory cursor')
      }
    }
    const pageSize = Math.min(Math.max(input.limit ?? INVENTORY_PAGE_SIZE, 1), INVENTORY_PAGE_SIZE)
    const { data, error } = await supabase.rpc('search_inventory', {
      p_query: input.query?.trim() ?? '',
      p_language: !input.language || input.language === 'all' ? null : input.language,
      p_sort: sort,
      p_cursor_value: cursorValue,
      p_cursor_id: cursorId,
      p_limit: pageSize + 1
    })
    assertNoError(error)
    const rows = (data ?? []) as InventoryTrack[]
    const hasMore = rows.length > pageSize
    const items = rows.slice(0, pageSize)
    const last = items.at(-1)
    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? JSON.stringify({ value: inventoryCursorValue(last, sort), id: last.id }) : null
    }
  },

  async getInventoryTrackOrders(trackId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, customer:customers(id,name,phone), service:services(id,code,name,price), assignee:profiles!orders_assigned_to_fkey(id,full_name)')
      .eq('inventory_track_id', trackId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    assertNoError(error)
    return (data ?? []) as unknown as Order[]
  },

  async previewCustomerPurge(customerId: string) {
    const { data, error } = await supabase.functions.invoke<CustomerPurgePreview>('customer-privacy-purge', {
      body: { action: 'preview', customerId }
    })
    assertNoError(error)
    if (!data) throw new Error('Customer purge preview was empty')
    return data
  },

  async purgeCustomer(customerId: string, confirmationName: string) {
    const { data, error } = await supabase.functions.invoke<CustomerPurgeResult>('customer-privacy-purge', {
      body: { action: 'confirm', customerId, confirmationName }
    })
    assertNoError(error)
    if (!data) throw new Error('Customer purge result was empty')
    return data
  },

  async createOrder(input: CreateOrderInput, actor: Profile) {
    const { error } = await supabase.rpc('create_order', {
      p_customer_name: input.customerName,
      p_phone: input.phone,
      p_whatsapp: input.whatsapp || null,
      p_customer_notes: input.customerNotes || null,
      p_service_id: input.serviceId,
      p_inventory_track_id: input.inventoryTrackId || null,
      p_track_name: input.trackName,
      p_language: input.language,
      p_due_date: input.dueDate || null,
      p_assigned_to: input.assignedTo || actor.id,
      p_notes: input.notes || null
    })
    assertNoError(error)
  },

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (status === 'delivered') update.delivered_at = new Date().toISOString()
    const { error } = await supabase.from('orders').update(update).eq('id', orderId)
    assertNoError(error)
  },

  async uploadPayment(orderId, amount, upiReference, file, actor) {
    const proofPath = await upload('payment-proofs', file, actor)
    const { error } = await supabase.from('payments').insert({
      order_id: orderId,
      amount,
      proof_path: proofPath,
      upi_reference: upiReference || null,
      uploaded_by: actor.id
    })
    assertNoError(error)
  },

  async confirmPayment(paymentId) {
    const { error } = await supabase.rpc('confirm_payment', { p_payment_id: paymentId })
    assertNoError(error)
  },

  async completeOrder(orderId, addToInventory, trackInput) {
    const { error } = await supabase.rpc('complete_order', {
      p_order_id: orderId,
      p_add_to_inventory: addToInventory,
      p_english_title: trackInput?.englishTitle || null,
      p_malayalam_title: trackInput?.malayalamTitle || null,
      p_tags: trackInput?.tags ?? [],
      p_file_path: trackInput?.filePath || null
    })
    assertNoError(error)
  },

  async createTrack(input: CreateTrackInput) {
    const { error } = await supabase.from('inventory_tracks').insert({
      track_name: input.trackName,
      english_title: input.englishTitle || input.trackName,
      malayalam_title: input.malayalamTitle || null,
      language: input.language,
      tags: input.tags ?? [],
      file_path: input.filePath || null,
      created_from_order_id: input.createdFromOrderId || null
    })
    assertNoError(error)
  },

  async updateCustomer(id, input) {
    const { error } = await supabase.from('customers').update({
      name: input.name,
      whatsapp: input.whatsapp || null,
      notes: input.notes || null,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    assertNoError(error)
  },

  async createExpense(input: { amount: number; category: ExpenseCategory; description: string; expenseDate: string; file: File | null }, actor: Profile) {
    const receiptPath = await upload('expense-receipts', input.file, actor)
    const { error } = await supabase.from('expenses').insert({
      amount: input.amount,
      category: input.category,
      description: input.description,
      receipt_path: receiptPath,
      expense_date: input.expenseDate,
      added_by: actor.id
    })
    assertNoError(error)
  },

  async requestWithdrawal(input: { amount: number; reason: WithdrawalReason; notes?: string }, actor: Profile) {
    const { error } = await supabase.from('withdrawals').insert({
      requested_by: actor.id,
      amount: input.amount,
      reason: input.reason,
      notes: input.notes || null
    })
    assertNoError(error)
  },

  async reviewWithdrawal(id, decision) {
    const { error } = await supabase.rpc('review_withdrawal', { p_withdrawal_id: id, p_decision: decision })
    assertNoError(error)
  },

  async updateService(id: string, input: Pick<Service, 'name' | 'price' | 'active'>) {
    const { error } = await supabase.from('services').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id)
    assertNoError(error)
  },

  async markNotificationsRead(ids: string[]) {
    if (!ids.length) return
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    assertNoError(error)
  },

  async updateProfileRole(id: string, role: Role) {
    const { error } = await supabase.rpc('set_profile_role', { p_profile_id: id, p_role: role })
    assertNoError(error)
  }
}
