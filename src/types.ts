export type Role = 'founder' | 'operations'
export type OrderStatus =
  | 'inquiry'
  | 'payment_pending'
  | 'in_progress'
  | 'completed'
  | 'delivered'
  | 'cancelled'
export type PaymentStatus = 'unpaid' | 'proof_uploaded' | 'confirmed' | 'refunded'
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected'
export type ExpenseStatus = 'pending' | 'approved' | 'rejected'
export type ExpenseCategory = 'meta_ads' | 'travel' | 'food' | 'internet' | 'equipment' | 'miscellaneous'
export type WithdrawalReason = 'salary' | 'profit_share' | 'travel' | 'food' | 'miscellaneous'
export type AiActionType =
  | 'create_order'
  | 'update_order_status'
  | 'open_payment_proof'
  | 'confirm_payment'
  | 'complete_order'
  | 'deliver_order'
  | 'create_inventory_track'
  | 'update_customer'
  | 'create_expense'
  | 'request_withdrawal'
  | 'review_withdrawal'
  | 'update_service'
  | 'update_team_role'
export type AiProposalStatus = 'pending' | 'executing' | 'confirmed' | 'failed' | 'expired' | 'cancelled'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  avatar_url?: string | null
  active: boolean
  can_submit_expenses?: boolean
  created_at: string
}

export interface Service {
  id: string
  code: 'AU150' | 'EX250' | 'ML350' | 'OL450' | string
  name: string
  price: number
  description?: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  whatsapp?: string | null
  notes?: string | null
  total_orders: number
  lifetime_revenue: number
  last_ordered_at?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface InventoryTrack {
  id: string
  track_name: string
  english_title?: string | null
  malayalam_title?: string | null
  language: string
  tags: string[]
  file_path?: string | null
  created_from_order_id?: string | null
  total_orders: number
  lifetime_revenue: number
  last_ordered_at?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface Order {
  id: string
  order_number: string
  customer_id: string
  service_id: string
  inventory_track_id?: string | null
  track_name: string
  language: string
  due_date?: string | null
  assigned_to?: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  price: number
  notes?: string | null
  created_by: string
  created_at: string
  updated_at: string
  completed_at?: string | null
  delivered_at?: string | null
  deleted_at?: string | null
  customer?: Pick<Customer, 'id' | 'name' | 'phone'> | null
  service?: Pick<Service, 'id' | 'code' | 'name' | 'price'> | null
  assignee?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface Payment {
  id: string
  order_id: string
  amount: number
  proof_path?: string | null
  upi_reference?: string | null
  status: 'pending' | 'confirmed' | 'rejected'
  uploaded_by: string
  confirmed_by?: string | null
  confirmed_at?: string | null
  created_at: string
}

export interface Expense {
  id: string
  amount: number
  category: ExpenseCategory
  description: string
  receipt_path?: string | null
  expense_date: string
  added_by: string
  status: ExpenseStatus
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
  deleted_at?: string | null
  creator?: Pick<Profile, 'id' | 'full_name'> | null
  reviewer?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface MonthlyRevenueTarget {
  month_start: string
  target_amount: number
  updated_by: string
  updated_at: string
}

export interface MonthlyTargetForecast {
  target: number
  earned: number
  remaining: number
  progressPercent: number
  daysElapsed: number
  daysRemaining: number
  dailyRequired: number
  projectedMonthEnd: number
  status: 'not_set' | 'behind' | 'on_track' | 'achieved'
}

export interface Withdrawal {
  id: string
  requested_by: string
  amount: number
  reason: WithdrawalReason
  notes?: string | null
  status: WithdrawalStatus
  approved_by?: string | null
  reviewed_at?: string | null
  created_at: string
  requester?: Pick<Profile, 'id' | 'full_name'> | null
  approver?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface Notification {
  id: string
  recipient_id: string
  type: 'new_order' | 'payment_uploaded' | 'withdrawal_requested' | 'order_completed' | 'system'
  title: string
  message: string
  entity_type?: string | null
  entity_id?: string | null
  read_at?: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id?: string | null
  action: string
  entity_type: string
  entity_id?: string | null
  before_data?: Record<string, unknown> | null
  after_data?: Record<string, unknown> | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface WalletTransaction {
  id: string
  type: 'payment' | 'expense' | 'withdrawal' | 'adjustment'
  amount: number
  reference_type: string
  reference_id: string
  description: string
  created_at: string
}

export interface AiConversation {
  id: string
  owner_id: string
  title: string
  created_at: string
  updated_at: string
  owner?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export interface AiMessage {
  id: string
  conversation_id: string
  sender: 'user' | 'assistant'
  content: string
  model?: string | null
  created_at: string
}

export interface AiActionProposal {
  id: string
  conversation_id: string
  assistant_message_id?: string | null
  requested_by: string
  action_type: AiActionType
  payload: Record<string, unknown>
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  preconditions: Record<string, unknown>
  status: AiProposalStatus
  expires_at: string
  confirmed_by?: string | null
  confirmed_at?: string | null
  execution_result?: Record<string, unknown> | null
  created_at: string
}

export interface AiSettings {
  id: number
  enabled: boolean
  primary_model: 'meta/llama-3.3-70b-instruct' | 'openai/gpt-oss-20b'
  fallback_model: 'meta/llama-3.3-70b-instruct' | 'openai/gpt-oss-20b'
  daily_request_limit: number
  max_output_tokens: number
  provider_status: 'not_checked' | 'available' | 'degraded' | 'unavailable'
  provider_checked_at?: string | null
  provider_error?: string | null
  updated_by?: string | null
  updated_at: string
}

export interface AiUsage {
  requestCount: number
  dailyLimit: number
  remaining: number
  inputTokens: number
  outputTokens: number
}

export interface AiCopilotResponse {
  conversationId: string
  message: AiMessage
  proposals: AiActionProposal[]
  usage: AiUsage
  model: string
  fallbackUsed: boolean
}

export interface RecordedSale {
  id: string
  source_ref: string
  record_date: string
  contact_name?: string | null
  phone?: string | null
  quoted_amount: number
  currency: 'INR'
  fulfillment_hint: 'audio' | 'missing_track' | 'named_track' | 'unspecified'
  track_title?: string | null
  raw_note?: string | null
  verified: boolean
  verified_at?: string | null
  created_at: string
}

export interface AppSnapshot {
  services: Service[]
  profiles: Profile[]
  customers: Customer[]
  inventorySummary: InventorySummary
  orders: Order[]
  recordedSales: RecordedSale[]
  payments: Payment[]
  expenses: Expense[]
  withdrawals: Withdrawal[]
  notifications: Notification[]
  auditLogs: AuditLog[]
  walletTransactions: WalletTransaction[]
  monthlyTarget: MonthlyRevenueTarget | null
  syncedAt: string
}

export type InventorySort = 'recent' | 'orders' | 'revenue' | 'name'

export interface InventoryQuery {
  query?: string
  language?: string
  sort?: InventorySort
  cursor?: string | null
  limit?: number
}

export interface InventorySummary {
  totalAssets: number
  totalRevenue: number
  reusedAssets: number
  topTrack: Pick<InventoryTrack, 'id' | 'track_name' | 'language' | 'lifetime_revenue'> | null
  languages: string[]
}

export interface InventoryPageResult {
  items: InventoryTrack[]
  nextCursor: string | null
  hasMore: boolean
}

export interface CustomerPurgeAffected {
  customers: number
  orders: number
  payments: number
  recordedSales: number
  proofs: number
  notifications: number
  aiProposals: number
}

export interface CustomerPurgePreview {
  customerName: string
  affected: CustomerPurgeAffected
  retainedFinancialAmount: number
}

export interface CustomerPurgeResult {
  purgeId: string
  affected: CustomerPurgeAffected
  retainedFinancialAmount: number
  proofCleanupStatus: 'pending' | 'completed' | 'failed'
}

export type RefreshDomain =
  | 'services'
  | 'profiles'
  | 'customers'
  | 'orders'
  | 'payments'
  | 'inventory'
  | 'finance'
  | 'notifications'
  | 'recordedSales'
  | 'targets'

export interface DashboardMetrics {
  revenueToday: number
  revenueWeek: number
  revenueMonth: number
  totalRevenue: number
  walletBalance: number
  totalExpenses: number
  netProfit: number
  activeOrders: number
  pendingOrders: number
  completedOrders: number
  completedToday: number
  pendingWithdrawals: number
  totalInventory: number
  totalCustomers: number
  adSpend: number
  newCustomers: number
  recordedSaleCount: number
  recordedSalesTotal: number
  recordedContactCount: number
  recordedFirstDate?: string
  recordedLastDate?: string
}

export interface CreateOrderInput {
  customerName: string
  phone: string
  whatsapp?: string
  customerNotes?: string
  serviceId: string
  inventoryTrackId?: string
  trackName: string
  language: string
  dueDate?: string
  assignedTo?: string
  notes?: string
}

export interface CreateTrackInput {
  trackName: string
  englishTitle?: string
  malayalamTitle?: string
  language: string
  tags?: string[]
  filePath?: string
  createdFromOrderId?: string
}

export interface DataService {
  loadSnapshot(userId: string): Promise<AppSnapshot>
  loadDomains(snapshot: AppSnapshot, userId: string, domains: RefreshDomain[]): Promise<AppSnapshot>
  getInventorySummary(): Promise<InventorySummary>
  searchInventory(query: InventoryQuery): Promise<InventoryPageResult>
  getInventoryTrackOrders(trackId: string): Promise<Order[]>
  previewCustomerPurge(customerId: string): Promise<CustomerPurgePreview>
  purgeCustomer(customerId: string, confirmationName: string): Promise<CustomerPurgeResult>
  createOrder(input: CreateOrderInput, actor: Profile): Promise<void>
  updateOrderStatus(orderId: string, status: OrderStatus, actor: Profile): Promise<void>
  uploadPayment(orderId: string, amount: number, upiReference: string, file: File | null, actor: Profile): Promise<void>
  confirmPayment(paymentId: string, actor: Profile): Promise<void>
  completeOrder(orderId: string, addToInventory: boolean, trackInput: CreateTrackInput | null, actor: Profile): Promise<void>
  createTrack(input: CreateTrackInput, actor: Profile): Promise<void>
  updateCustomer(id: string, input: Pick<Customer, 'name' | 'whatsapp' | 'notes'>, actor: Profile): Promise<void>
  createExpense(input: { amount: number; category: ExpenseCategory; description: string; expenseDate: string; file: File | null }, actor: Profile): Promise<void>
  requestWithdrawal(input: { amount: number; reason: WithdrawalReason; notes?: string }, actor: Profile): Promise<void>
  reviewWithdrawal(id: string, decision: 'approved' | 'rejected', actor: Profile): Promise<void>
  reviewExpense(id: string, decision: 'approved' | 'rejected', actor: Profile): Promise<void>
  setExpensePermission(id: string, allowed: boolean, actor: Profile): Promise<void>
  upsertMonthlyTarget(monthStart: string, amount: number, actor: Profile): Promise<void>
  updateService(id: string, input: Pick<Service, 'name' | 'price' | 'active'>, actor: Profile): Promise<void>
  markNotificationsRead(ids: string[], actor: Profile): Promise<void>
  updateProfileRole(id: string, role: Role, actor: Profile): Promise<void>
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message?: string
}
