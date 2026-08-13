import { ArrowDownLeft, ArrowUpRight, Check, CircleDollarSign, Clock3, FileImage, Plus, ReceiptText, Search, ShieldCheck, WalletCards, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, MoneyStat, PageHeader, Select, StatusBadge, Textarea, cn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { expenseCategoryLabels, formatCurrency, formatDate, fromNow, withdrawalReasonLabels } from '../lib/format'
import type { Expense, ExpenseCategory, Withdrawal, WithdrawalReason } from '../types'

type FinanceTab = 'overview' | 'expenses' | 'withdrawals' | 'ledger'
const expenseCategories = Object.keys(expenseCategoryLabels) as ExpenseCategory[]
const withdrawalReasons = Object.keys(withdrawalReasonLabels) as WithdrawalReason[]

export function FinancePage() {
  const { profile } = useAuth()
  const { snapshot, metrics, service, execute, busyAction } = useAppData()
  const [tab, setTab] = useState<FinanceTab>('overview')
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [withdrawalOpen, setWithdrawalOpen] = useState(false)
  const [withdrawalReview, setWithdrawalReview] = useState<{ item: Withdrawal; decision: 'approved' | 'rejected' } | null>(null)
  const [expenseReview, setExpenseReview] = useState<{ item: Expense; decision: 'approved' | 'rejected' } | null>(null)
  if (!snapshot || !metrics || !profile) return null

  const pendingWithdrawals = snapshot.withdrawals.filter((item) => item.status === 'pending')
  const pendingExpenses = snapshot.expenses.filter((item) => item.status === 'pending')
  const canSubmitExpense = profile.role === 'founder' || Boolean(profile.can_submit_expenses)
  const reviewWithdrawal = async () => {
    if (!withdrawalReview) return
    await execute(`withdrawal-${withdrawalReview.item.id}`, `Withdrawal ${withdrawalReview.decision}`, () => service.reviewWithdrawal(withdrawalReview.item.id, withdrawalReview.decision, profile))
    setWithdrawalReview(null)
  }
  const reviewExpense = async () => {
    if (!expenseReview) return
    await execute(`expense-${expenseReview.item.id}`, `Expense ${expenseReview.decision}`, () => service.reviewExpense(expenseReview.item.id, expenseReview.decision, profile))
    setExpenseReview(null)
  }

  return <div className="page-stack finance-page">
    <PageHeader eyebrow="Controlled money flow" title="Wallet & finance" description="Only approved expenses and withdrawals reduce the live wallet." action={<div className="button-row">{canSubmitExpense && <Button variant="secondary" icon={<ReceiptText size={16} />} onClick={() => setExpenseOpen(true)}>Submit expense</Button>}<Button icon={<Plus size={16} />} onClick={() => setWithdrawalOpen(true)}>Request withdrawal</Button></div>} />
    <div className="finance-hero">
      <Card className="wallet-card"><div className="wallet-shine" /><div className="wallet-card-top"><span><WalletCards size={21} /> Brand wallet</span><Badge tone="green">Live ledger</Badge></div><div className="wallet-balance"><span>Available balance</span><strong>{formatCurrency(metrics.walletBalance)}</strong><small>Revenue − approved expenses − approved withdrawals</small></div><div className="wallet-card-bottom"><span>ABHINAND KARAOKES</span><ShieldCheck size={22} /></div></Card>
      <div className="finance-stats"><MoneyStat label="Total revenue" value={metrics.totalRevenue} icon={<ArrowDownLeft size={20} />} tone="positive" trend="Confirmed customer payments" /><MoneyStat label="Approved expenses" value={metrics.totalExpenses} icon={<ArrowUpRight size={20} />} tone="negative" trend="Business operating costs" /><MoneyStat label="Net profit" value={metrics.netProfit} icon={<CircleDollarSign size={20} />} trend="Before partner withdrawals" /><MoneyStat label="Pending approvals" value={[...pendingWithdrawals, ...pendingExpenses].reduce((sum, item) => sum + item.amount, 0)} icon={<Clock3 size={20} />} tone="accent" trend={`${pendingWithdrawals.length + pendingExpenses.length} awaiting review`} /></div>
    </div>
    <div className="tab-bar" role="tablist">{(['overview', 'expenses', 'withdrawals', 'ledger'] as FinanceTab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={cn(tab === item && 'active')} onClick={() => setTab(item)}>{item.charAt(0).toUpperCase() + item.slice(1)}{item === 'expenses' && pendingExpenses.length > 0 && <b>{pendingExpenses.length}</b>}{item === 'withdrawals' && pendingWithdrawals.length > 0 && <b>{pendingWithdrawals.length}</b>}</button>)}</div>
    {tab === 'overview' && <FinanceOverview />}
    {tab === 'expenses' && <ExpensesList canAdd={canSubmitExpense} canReview={profile.role === 'founder'} onAdd={() => setExpenseOpen(true)} onReview={(item, decision) => setExpenseReview({ item, decision })} />}
    {tab === 'withdrawals' && <WithdrawalsList canReview={profile.role === 'founder'} onReview={(item, decision) => setWithdrawalReview({ item, decision })} onRequest={() => setWithdrawalOpen(true)} />}
    {tab === 'ledger' && <LedgerList />}
    <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    <WithdrawalModal open={withdrawalOpen} onClose={() => setWithdrawalOpen(false)} balance={metrics.walletBalance} />
    <ConfirmDialog open={Boolean(withdrawalReview)} onClose={() => setWithdrawalReview(null)} onConfirm={() => void reviewWithdrawal()} title={withdrawalReview?.decision === 'approved' ? 'Approve withdrawal?' : 'Reject withdrawal?'} message={withdrawalReview?.decision === 'approved' ? `${formatCurrency(withdrawalReview.item.amount)} will be recorded as withdrawn from the brand wallet. Complete the manual transfer separately.` : `The request from ${withdrawalReview?.item.requester?.full_name ?? 'this user'} will be rejected and the wallet will not change.`} confirmLabel={withdrawalReview?.decision === 'approved' ? 'Approve & record' : 'Reject request'} danger={withdrawalReview?.decision === 'rejected'} loading={Boolean(withdrawalReview && busyAction === `withdrawal-${withdrawalReview.item.id}`)} />
    <ConfirmDialog open={Boolean(expenseReview)} onClose={() => setExpenseReview(null)} onConfirm={() => void reviewExpense()} title={expenseReview?.decision === 'approved' ? 'Approve expense?' : 'Reject expense?'} message={expenseReview?.decision === 'approved' ? `${formatCurrency(expenseReview.item.amount)} for “${expenseReview.item.description}” will be deducted from the wallet.` : 'This expense will be rejected and the wallet will not change.'} confirmLabel={expenseReview?.decision === 'approved' ? 'Approve & record' : 'Reject expense'} danger={expenseReview?.decision === 'rejected'} loading={Boolean(expenseReview && busyAction === `expense-${expenseReview.item.id}`)} />
  </div>
}

function FinanceOverview() {
  const { snapshot } = useAppData()
  if (!snapshot) return null
  const pending = [
    ...snapshot.expenses.filter((item) => item.status === 'pending').map((item) => ({ id: item.id, name: item.creator?.full_name, detail: expenseCategoryLabels[item.category], amount: item.amount })),
    ...snapshot.withdrawals.filter((item) => item.status === 'pending').map((item) => ({ id: item.id, name: item.requester?.full_name, detail: withdrawalReasonLabels[item.reason], amount: item.amount }))
  ].slice(0, 6)
  return <div className="finance-overview-grid"><Card className="table-card"><div className="card-heading"><div><span>Wallet activity</span><h2>Recent transactions</h2></div></div><TransactionList transactions={snapshot.walletTransactions.slice(0, 8)} /></Card><Card><div className="card-heading"><div><span>Attention</span><h2>Pending approvals</h2></div></div>{pending.length ? <div className="approval-preview">{pending.map((item) => <div key={item.id}><span className="list-avatar">{item.name?.[0] ?? 'R'}</span><div><strong>{item.name ?? 'Unknown'}</strong><small>{item.detail}</small></div><b>{formatCurrency(item.amount)}</b></div>)}</div> : <EmptyState title="No requests waiting" description="All finance requests have been reviewed." />}</Card></div>
}

function ExpensesList({ onAdd, canAdd, canReview, onReview }: { onAdd(): void; canAdd: boolean; canReview: boolean; onReview(item: Expense, decision: 'approved' | 'rejected'): void }) {
  const { snapshot } = useAppData(); const [query, setQuery] = useState('')
  if (!snapshot) return null
  const filtered = snapshot.expenses.filter((item) => `${item.description} ${item.category} ${item.creator?.full_name}`.toLowerCase().includes(query.toLowerCase()))
  return <Card className="table-card"><div className="table-toolbar"><div className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses…" /></div>{canAdd && <Button icon={<Plus size={16} />} onClick={onAdd}>Submit expense</Button>}</div>{filtered.length ? <div className="responsive-table"><table><thead><tr><th>Expense</th><th>Category</th><th>Date</th><th>Submitted by</th><th>Status</th><th>Receipt</th><th className="align-right">Amount</th>{canReview && <th>Action</th>}</tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.description}</strong><small>{fromNow(item.created_at)}</small></td><td><Badge>{expenseCategoryLabels[item.category]}</Badge></td><td>{formatDate(item.expense_date)}</td><td>{item.creator?.full_name ?? '—'}</td><td><StatusBadge status={item.status} /></td><td>{item.receipt_path ? <Badge tone="green">Attached</Badge> : <span className="muted">None</span>}</td><td className="align-right"><strong className={item.status === 'approved' ? 'negative-value' : ''}>{formatCurrency(item.amount)}</strong></td>{canReview && <td>{item.status === 'pending' ? <div className="row-actions"><button className="approve" aria-label="Approve expense" onClick={() => onReview(item, 'approved')}><Check size={16} /></button><button className="reject" aria-label="Reject expense" onClick={() => onReview(item, 'rejected')}><X size={16} /></button></div> : '—'}</td>}</tr>)}</tbody></table></div> : <EmptyState title="No expenses found" description="Submit business spending for Founder approval." />}</Card>
}

function WithdrawalsList({ canReview, onReview, onRequest }: { canReview: boolean; onReview(item: Withdrawal, decision: 'approved' | 'rejected'): void; onRequest(): void }) {
  const { snapshot } = useAppData(); if (!snapshot) return null
  return <Card className="table-card"><div className="table-toolbar"><div><strong>Withdrawal requests</strong><span className="result-count">{snapshot.withdrawals.length} total</span></div><Button icon={<Plus size={16} />} onClick={onRequest}>New request</Button></div>{snapshot.withdrawals.length ? <div className="responsive-table"><table><thead><tr><th>Requested by</th><th>Reason</th><th>Date</th><th>Status</th><th>Reviewed by</th><th className="align-right">Amount</th>{canReview && <th>Action</th>}</tr></thead><tbody>{snapshot.withdrawals.map((item) => <tr key={item.id}><td><strong>{item.requester?.full_name ?? 'Unknown'}</strong><small>{item.notes || 'No notes'}</small></td><td>{withdrawalReasonLabels[item.reason]}</td><td>{formatDate(item.created_at, 'long')}</td><td><StatusBadge status={item.status} /></td><td>{item.approver?.full_name ?? '—'}</td><td className="align-right"><strong>{formatCurrency(item.amount)}</strong></td>{canReview && <td>{item.status === 'pending' ? <div className="row-actions"><button className="approve" aria-label="Approve" onClick={() => onReview(item, 'approved')}><Check size={16} /></button><button className="reject" aria-label="Reject" onClick={() => onReview(item, 'rejected')}><X size={16} /></button></div> : '—'}</td>}</tr>)}</tbody></table></div> : <EmptyState title="No withdrawal requests" description="Team members can request salary, profit share and reimbursements here." />}</Card>
}

function LedgerList() { const { snapshot } = useAppData(); return snapshot ? <Card className="table-card"><div className="card-heading"><div><span>Immutable money trail</span><h2>Wallet ledger</h2></div><Badge tone="green">Balanced</Badge></div><TransactionList transactions={snapshot.walletTransactions} /></Card> : null }
function TransactionList({ transactions }: { transactions: NonNullable<ReturnType<typeof useAppData>['snapshot']>['walletTransactions'] }) { return transactions.length ? <div className="transaction-list">{transactions.map((item) => <div key={item.id}><span className={item.amount >= 0 ? 'money-in' : 'money-out'}>{item.amount >= 0 ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><div><strong>{item.description}</strong><small>{item.type.charAt(0).toUpperCase() + item.type.slice(1)} · {formatDate(item.created_at, 'long')}</small></div><b className={item.amount >= 0 ? 'positive-value' : 'negative-value'}>{item.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(item.amount))}</b></div>)}</div> : <EmptyState title="No wallet activity" description="Confirmed payments, expenses and withdrawals appear automatically." /> }

function ExpenseModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { profile } = useAuth(); const { service, execute, busyAction } = useAppData()
  const [amount, setAmount] = useState(''); const [category, setCategory] = useState<ExpenseCategory>('meta_ads'); const [description, setDescription] = useState(''); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [file, setFile] = useState<File | null>(null)
  if (!profile) return null
  const close = () => { setAmount(''); setDescription(''); setCategory('meta_ads'); setDate(new Date().toISOString().slice(0, 10)); setFile(null); onClose() }
  const submit = async (event: FormEvent) => { event.preventDefault(); await execute('create-expense', 'Expense submitted for approval', () => service.createExpense({ amount: Number(amount), category, description, expenseDate: date, file }, profile)); close() }
  return <Modal open={open} onClose={close} title="Submit business expense" description="Founder approval is required before this reduces the wallet." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="expense-form" type="submit" loading={busyAction === 'create-expense'}>Submit for approval</Button></>}><form id="expense-form" onSubmit={submit} className="form-stack"><Input label="Amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /><Select label="Category" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{expenseCategories.map((item) => <option key={item} value={item}>{expenseCategoryLabels[item]}</option>)}</Select><Textarea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was this spend for?" required rows={3} /><Input label="Expense date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} required /><label className="file-drop compact"><FileImage size={21} /><strong>{file ? file.name : 'Attach receipt (optional)'}</strong><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><div className="form-notice"><ShieldCheck size={16} /> Pending expenses do not affect wallet or profit.</div></form></Modal>
}

function WithdrawalModal({ open, onClose, balance }: { open: boolean; onClose(): void; balance: number }) {
  const { profile } = useAuth(); const { service, execute, busyAction } = useAppData(); const [amount, setAmount] = useState(''); const [reason, setReason] = useState<WithdrawalReason>('salary'); const [notes, setNotes] = useState('')
  if (!profile) return null
  const close = () => { setAmount(''); setReason('salary'); setNotes(''); onClose() }
  const submit = async (event: FormEvent) => { event.preventDefault(); await execute('request-withdrawal', 'Withdrawal request sent to Founder', () => service.requestWithdrawal({ amount: Number(amount), reason, notes }, profile)); close() }
  return <Modal open={open} onClose={close} title="Request withdrawal" description="Founder approval is required before any manual transfer." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="withdrawal-form" type="submit" loading={busyAction === 'request-withdrawal'}>Send request</Button></>}><form id="withdrawal-form" onSubmit={submit} className="form-stack"><div className="available-note"><WalletCards size={18} /><span>Available wallet</span><strong>{formatCurrency(balance)}</strong></div><Input label="Amount" type="number" min="1" max={Math.max(1, balance)} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /><Select label="Reason" value={reason} onChange={(event) => setReason(event.target.value as WithdrawalReason)}>{withdrawalReasons.map((item) => <option key={item} value={item}>{withdrawalReasonLabels[item]}</option>)}</Select><Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for the Founder…" rows={3} /><div className="form-notice"><ShieldCheck size={16} /> Submitting this request does not move money or reduce the wallet.</div></form></Modal>
}
