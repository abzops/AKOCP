import { ArrowDownLeft, ArrowUpRight, Banknote, Check, CircleDollarSign, Clock3, FileImage, Plus, ReceiptText, Search, ShieldCheck, WalletCards, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, MoneyStat, PageHeader, Select, StatusBadge, Textarea, cn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { expenseCategoryLabels, formatCurrency, formatDate, fromNow, withdrawalReasonLabels } from '../lib/format'
import type { ExpenseCategory, Withdrawal, WithdrawalReason } from '../types'

type FinanceTab = 'overview' | 'expenses' | 'withdrawals' | 'ledger'
const expenseCategories = Object.keys(expenseCategoryLabels) as ExpenseCategory[]
const withdrawalReasons = Object.keys(withdrawalReasonLabels) as WithdrawalReason[]

export function FinancePage() {
  const { profile } = useAuth()
  const { snapshot, metrics, service, execute, busyAction } = useAppData()
  const [tab, setTab] = useState<FinanceTab>('overview')
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [withdrawalOpen, setWithdrawalOpen] = useState(false)
  const [review, setReview] = useState<{ withdrawal: Withdrawal; decision: 'approved' | 'rejected' } | null>(null)
  if (!snapshot || !metrics || !profile) return null
  const pending = snapshot.withdrawals.filter((item) => item.status === 'pending')
  const approveOrReject = async () => {
    if (!review) return
    await execute(`withdrawal-${review.withdrawal.id}`, `Withdrawal ${review.decision}`, () => service.reviewWithdrawal(review.withdrawal.id, review.decision, profile))
    setReview(null)
  }
  return (
    <div className="page-stack finance-page">
      <PageHeader eyebrow="Controlled money flow" title="Wallet & finance" description="Confirmed payments fund the brand wallet; expenses and approved withdrawals reduce it." action={<div className="button-row">{profile.role === 'founder' && <Button variant="secondary" icon={<ReceiptText size={16} />} onClick={() => setExpenseOpen(true)}>Add expense</Button>}<Button icon={<Plus size={16} />} onClick={() => setWithdrawalOpen(true)}>Request withdrawal</Button></div>} />
      <div className="finance-hero">
        <Card className="wallet-card"><div className="wallet-shine" /><div className="wallet-card-top"><span><WalletCards size={21} /> Brand wallet</span><Badge tone="green">Live ledger</Badge></div><div className="wallet-balance"><span>Available balance</span><strong>{formatCurrency(metrics.walletBalance)}</strong><small>Revenue − expenses − approved withdrawals</small></div><div className="wallet-card-bottom"><span>ABHINAND KARAOKES</span><ShieldCheck size={22} /></div></Card>
        <div className="finance-stats"><MoneyStat label="Total revenue" value={metrics.totalRevenue} icon={<ArrowDownLeft size={20} />} tone="positive" trend="Confirmed customer payments" /><MoneyStat label="Total expenses" value={metrics.totalExpenses} icon={<ArrowUpRight size={20} />} tone="negative" trend="Business operating costs" /><MoneyStat label="Net profit" value={metrics.netProfit} icon={<CircleDollarSign size={20} />} trend="Before partner withdrawals" /><MoneyStat label="Pending requests" value={pending.reduce((sum, item) => sum + item.amount, 0)} icon={<Clock3 size={20} />} tone="accent" trend={`${pending.length} awaiting review`} /></div>
      </div>
      <div className="tab-bar" role="tablist">{(['overview', 'expenses', 'withdrawals', 'ledger'] as FinanceTab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={cn(tab === item && 'active')} onClick={() => setTab(item)}>{item.charAt(0).toUpperCase() + item.slice(1)}{item === 'withdrawals' && pending.length > 0 && <b>{pending.length}</b>}</button>)}</div>
      {tab === 'overview' && <FinanceOverview />}
      {tab === 'expenses' && <ExpensesList onAdd={() => setExpenseOpen(true)} canAdd={profile.role === 'founder'} />}
      {tab === 'withdrawals' && <WithdrawalsList canReview={profile.role === 'founder'} onReview={(withdrawal, decision) => setReview({ withdrawal, decision })} onRequest={() => setWithdrawalOpen(true)} />}
      {tab === 'ledger' && <LedgerList />}
      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
      <WithdrawalModal open={withdrawalOpen} onClose={() => setWithdrawalOpen(false)} balance={metrics.walletBalance} />
      <ConfirmDialog open={Boolean(review)} onClose={() => setReview(null)} onConfirm={() => void approveOrReject()} title={review?.decision === 'approved' ? 'Approve withdrawal?' : 'Reject withdrawal?'} message={review?.decision === 'approved' ? `${formatCurrency(review.withdrawal.amount)} will be recorded as withdrawn from the brand wallet. Complete the manual UPI transfer separately.` : `The request from ${review?.withdrawal.requester?.full_name ?? 'this user'} will be marked rejected and the wallet will not change.`} confirmLabel={review?.decision === 'approved' ? 'Approve & record' : 'Reject request'} danger={review?.decision === 'rejected'} loading={Boolean(review && busyAction === `withdrawal-${review.withdrawal.id}`)} />
    </div>
  )
}

function FinanceOverview() {
  const { snapshot } = useAppData()
  if (!snapshot) return null
  const recentTransactions = snapshot.walletTransactions.slice(0, 8)
  const pending = snapshot.withdrawals.filter((item) => item.status === 'pending').slice(0, 4)
  return <div className="finance-overview-grid"><Card className="table-card"><div className="card-heading"><div><span>Wallet activity</span><h2>Recent transactions</h2></div></div><TransactionList transactions={recentTransactions} /></Card><Card><div className="card-heading"><div><span>Attention</span><h2>Pending withdrawals</h2></div></div>{pending.length ? <div className="approval-preview">{pending.map((item) => <div key={item.id}><span className="list-avatar">{item.requester?.full_name?.[0] ?? 'R'}</span><div><strong>{item.requester?.full_name}</strong><small>{withdrawalReasonLabels[item.reason]} · {fromNow(item.created_at)}</small></div><b>{formatCurrency(item.amount)}</b></div>)}</div> : <EmptyState title="No requests waiting" description="All withdrawal requests have been reviewed." />}</Card></div>
}

function ExpensesList({ onAdd, canAdd }: { onAdd(): void; canAdd: boolean }) {
  const { snapshot } = useAppData()
  const [query, setQuery] = useState('')
  if (!snapshot) return null
  const filtered = snapshot.expenses.filter((expense) => `${expense.description} ${expense.category}`.toLowerCase().includes(query.toLowerCase()))
  return <Card className="table-card"><div className="table-toolbar"><div className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses…" /></div>{canAdd && <Button icon={<Plus size={16} />} onClick={onAdd}>Add expense</Button>}</div>{filtered.length ? <div className="responsive-table"><table><thead><tr><th>Expense</th><th>Category</th><th>Date</th><th>Added by</th><th>Receipt</th><th className="align-right">Amount</th></tr></thead><tbody>{filtered.map((expense) => <tr key={expense.id}><td><strong>{expense.description}</strong><small>{fromNow(expense.created_at)}</small></td><td><Badge>{expenseCategoryLabels[expense.category]}</Badge></td><td>{formatDate(expense.expense_date)}</td><td>{expense.creator?.full_name ?? '—'}</td><td>{expense.receipt_path ? <Badge tone="green">Attached</Badge> : <span className="muted">None</span>}</td><td className="align-right"><strong className="negative-value">−{formatCurrency(expense.amount)}</strong></td></tr>)}</tbody></table></div> : <EmptyState title="No expenses found" description="Add business spending to keep profit and wallet figures accurate." />}</Card>
}

function WithdrawalsList({ canReview, onReview, onRequest }: { canReview: boolean; onReview(withdrawal: Withdrawal, decision: 'approved' | 'rejected'): void; onRequest(): void }) {
  const { snapshot } = useAppData()
  if (!snapshot) return null
  return <Card className="table-card"><div className="table-toolbar"><div><strong>Withdrawal requests</strong><span className="result-count">{snapshot.withdrawals.length} total</span></div><Button icon={<Plus size={16} />} onClick={onRequest}>New request</Button></div>{snapshot.withdrawals.length ? <div className="responsive-table"><table><thead><tr><th>Requested by</th><th>Reason</th><th>Date</th><th>Status</th><th>Reviewed by</th><th className="align-right">Amount</th>{canReview && <th>Action</th>}</tr></thead><tbody>{snapshot.withdrawals.map((withdrawal) => <tr key={withdrawal.id}><td><strong>{withdrawal.requester?.full_name ?? 'Unknown'}</strong><small>{withdrawal.notes || 'No notes'}</small></td><td>{withdrawalReasonLabels[withdrawal.reason]}</td><td>{formatDate(withdrawal.created_at, 'long')}</td><td><StatusBadge status={withdrawal.status} /></td><td>{withdrawal.approver?.full_name ?? '—'}</td><td className="align-right"><strong>{formatCurrency(withdrawal.amount)}</strong></td>{canReview && <td>{withdrawal.status === 'pending' ? <div className="row-actions"><button className="approve" aria-label="Approve" onClick={() => onReview(withdrawal, 'approved')}><Check size={16} /></button><button className="reject" aria-label="Reject" onClick={() => onReview(withdrawal, 'rejected')}><X size={16} /></button></div> : '—'}</td>}</tr>)}</tbody></table></div> : <EmptyState title="No withdrawal requests" description="Operations can request salary, profit share and reimbursements here." />}</Card>
}

function LedgerList() {
  const { snapshot } = useAppData()
  if (!snapshot) return null
  return <Card className="table-card"><div className="card-heading"><div><span>Immutable money trail</span><h2>Wallet ledger</h2></div><Badge tone="green">Balanced</Badge></div><TransactionList transactions={snapshot.walletTransactions} /></Card>
}

function TransactionList({ transactions }: { transactions: NonNullable<ReturnType<typeof useAppData>['snapshot']>['walletTransactions'] }) {
  return transactions.length ? <div className="transaction-list">{transactions.map((transaction) => <div key={transaction.id}><span className={transaction.amount >= 0 ? 'money-in' : 'money-out'}>{transaction.amount >= 0 ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><div><strong>{transaction.description}</strong><small>{transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} · {formatDate(transaction.created_at, 'long')}</small></div><b className={transaction.amount >= 0 ? 'positive-value' : 'negative-value'}>{transaction.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(transaction.amount))}</b></div>)}</div> : <EmptyState title="No wallet activity" description="Confirmed payments, expenses and withdrawals appear automatically." />
}

function ExpenseModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { profile } = useAuth()
  const { service, execute, busyAction } = useAppData()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('meta_ads')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [file, setFile] = useState<File | null>(null)
  if (!profile) return null
  const close = () => { setAmount(''); setDescription(''); setCategory('meta_ads'); setDate(new Date().toISOString().slice(0, 10)); setFile(null); onClose() }
  const submit = async (event: FormEvent) => { event.preventDefault(); await execute('create-expense', 'Expense recorded in wallet', () => service.createExpense({ amount: Number(amount), category, description, expenseDate: date, file }, profile)); close() }
  return <Modal open={open} onClose={close} title="Record business expense" description="This amount will reduce the available brand wallet balance." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="expense-form" type="submit" loading={busyAction === 'create-expense'}>Record expense</Button></>}><form id="expense-form" onSubmit={submit} className="form-stack"><Input label="Amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /><Select label="Category" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{expenseCategories.map((item) => <option key={item} value={item}>{expenseCategoryLabels[item]}</option>)}</Select><Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was this spend for?" required rows={3} /><Input label="Expense date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} required /><label className="file-drop compact"><FileImage size={21} /><strong>{file ? file.name : 'Attach receipt (optional)'}</strong><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label></form></Modal>
}

function WithdrawalModal({ open, onClose, balance }: { open: boolean; onClose(): void; balance: number }) {
  const { profile } = useAuth()
  const { service, execute, busyAction } = useAppData()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<WithdrawalReason>('salary')
  const [notes, setNotes] = useState('')
  if (!profile) return null
  const close = () => { setAmount(''); setReason('salary'); setNotes(''); onClose() }
  const submit = async (event: FormEvent) => { event.preventDefault(); await execute('request-withdrawal', 'Withdrawal request sent to Founder', () => service.requestWithdrawal({ amount: Number(amount), reason, notes }, profile)); close() }
  return <Modal open={open} onClose={close} title="Request withdrawal" description="Founder approval is required before any manual UPI transfer." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="withdrawal-form" type="submit" loading={busyAction === 'request-withdrawal'}>Send request</Button></>}><form id="withdrawal-form" onSubmit={submit} className="form-stack"><div className="available-note"><WalletCards size={18} /><span>Available wallet</span><strong>{formatCurrency(balance)}</strong></div><Input label="Amount" type="number" min="1" max={Math.max(1, balance)} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /><Select label="Reason" value={reason} onChange={(event) => setReason(event.target.value as WithdrawalReason)}>{withdrawalReasons.map((item) => <option key={item} value={item}>{withdrawalReasonLabels[item]}</option>)}</Select><Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for the Founder…" rows={3} /><div className="form-notice"><ShieldCheck size={16} /> Submitting this request does not move money or reduce the wallet.</div></form></Modal>
}
