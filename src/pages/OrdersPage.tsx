import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, Download, FileImage, Filter, MessageCircle, Music2, PackageCheck, Plus, Search, Send, Trash2, UserRound, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, PageHeader, Select, StatusBadge, Textarea, cn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { aiService } from '../lib/ai-service'
import { downloadCsv, formatCurrency, formatDate, fromNow, normalizeSearch, paymentStatusLabels, statusLabels } from '../lib/format'
import { CreateOrderModal } from '../components/CreateOrderModal'
import { businessDate } from '../lib/dashboard'
import { OrderBoard } from '../components/OrderBoard'
import { OrderOperations, OrderPayments } from '../components/OrderOperations'
import { FollowupComposer } from '../components/FollowupComposer'
import { orderBalance } from '../lib/operations'
import type { Order, OrderDeletionPreview, OrderStatus } from '../types'

const statuses: Array<'all' | OrderStatus> = ['all', 'inquiry', 'payment_pending', 'in_progress', 'completed', 'delivered', 'cancelled']

export function OrdersPage() {
  const { profile } = useAuth()
  const { snapshot, service, execute, busyAction, showToast } = useAppData()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [viewMode,setViewMode]=useState<'board'|'list'>('board')
  const [visibleRows,setVisibleRows]=useState(50)
  const [dashboardView, setDashboardView] = useState('')
  const [status, setStatus] = useState<'all' | OrderStatus>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Order | null>(null)
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null)
  const [paymentHandoff, setPaymentHandoff] = useState<{ proposalId: string; amount: number; upiReference: string } | null>(null)
  const [completeOrder, setCompleteOrder] = useState<Order | null>(null)
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null)
  const [deletionPreview, setDeletionPreview] = useState<OrderDeletionPreview | null>(null)
  const [deletionConfirmation, setDeletionConfirmation] = useState('')
  const [deletionLoading, setDeletionLoading] = useState(false)
  const [deletionError, setDeletionError] = useState<string | null>(null)

  useEffect(() => {
    const requestedStatus=params.get('status')
    const requestedView=params.get('view')
    const requestedOrder=params.get('order')
    if (requestedStatus && statuses.includes(requestedStatus as OrderStatus)) { setStatus(requestedStatus as OrderStatus); setDashboardView(''); setParams({}, {replace:true}) }
    if (requestedView) { setStatus('all'); setDashboardView(requestedView); setParams({}, {replace:true}) }
    if (requestedOrder && snapshot) { const order=snapshot.orders.find(o=>o.id===requestedOrder); if(order)setSelected(order);setParams({}, {replace:true}) }
  }, [params,setParams,snapshot])

  useEffect(() => {
    if (params.get('new') === '1') {
      setCreateOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  useEffect(() => {
    if (params.get('aiPayment') !== '1' || !snapshot) return
    try {
      const stored = sessionStorage.getItem('akocp-ai-payment')
      if (!stored) throw new Error('The payment proposal handoff is missing')
      const handoff = JSON.parse(stored) as { proposalId: string; orderId: string; amount: number; upiReference: string }
      const order = snapshot.orders.find((item) => item.id === handoff.orderId)
      if (!order) throw new Error('The proposed order is no longer available')
      setPaymentHandoff({ proposalId: handoff.proposalId, amount: Number(handoff.amount), upiReference: handoff.upiReference || '' })
      setPaymentOrder(order)
    } catch {
      sessionStorage.removeItem('akocp-ai-payment')
    } finally {
      setParams({}, { replace: true })
    }
  }, [params, setParams, snapshot])

  useEffect(() => {
    if (!deletingOrder) {
      setDeletionPreview(null)
      setDeletionConfirmation('')
      setDeletionError(null)
      return
    }
    let active = true
    setDeletionLoading(true)
    setDeletionError(null)
    service.previewOrderDeletion(deletingOrder.id).then((preview) => {
      if (active) setDeletionPreview(preview)
    }).catch((error) => {
      if (active) setDeletionError(error instanceof Error ? error.message : 'Could not prepare order deletion.')
    }).finally(() => {
      if (active) setDeletionLoading(false)
    })
    return () => { active = false }
  }, [deletingOrder, service])

  useEffect(()=>setVisibleRows(50),[query,status,dashboardView,viewMode])
  if (!snapshot || !profile) return null
  const today=businessDate(new Date())
  const selectedCurrent=selected?snapshot.orders.find(o=>o.id===selected.id)??selected:null
  const filtered = snapshot.orders.filter((order) => {
    const open=!['delivered','cancelled'].includes(order.status)
    if (dashboardView==='overdue' && !(open&&order.due_date&&order.due_date<today)) return false
    if (dashboardView==='due_today' && !(open&&order.due_date===today)) return false
    if (dashboardView==='payment_review' && !snapshot.payments.some(p=>p.order_id===order.id&&p.status==='pending')) return false
    if (dashboardView==='unpaid' && orderBalance(order,snapshot.payments).collectible<=0) return false
    if (dashboardView==='balance_review' && !orderBalance(order,snapshot.payments).review) return false
    if (dashboardView==='unassigned' && !(open&&!order.assigned_to)) return false
    if (dashboardView==='revisions' && !order.revision_requested) return false
    const matchesStatus = status === 'all' || order.status === status
    const text = normalizeSearch(`${order.order_number} ${order.track_name} ${order.language} ${order.customer?.name} ${order.customer?.phone} ${order.service?.code}`)
    return matchesStatus && text.includes(normalizeSearch(query))
  })
  const pendingPayments = snapshot.payments.filter((payment) => payment.status === 'pending').length
  const dueSoon = snapshot.orders.filter((order) => order.due_date && !['completed', 'delivered', 'cancelled'].includes(order.status) && new Date(order.due_date).getTime() <= Date.now() + 2 * 86400000).length

  const openDetails = (order: Order) => setSelected(order)
  const changeStatus = async (order: Order, nextStatus: OrderStatus) => {
    await execute(`order-${order.id}`, `Order marked ${statusLabels[nextStatus].toLowerCase()}`, () => service.updateOrderStatus(order.id, nextStatus, profile))
    setSelected(null)
  }
  const confirmPayment = async (order: Order) => {
    const payment = snapshot.payments.find((item) => item.order_id === order.id && item.status === 'pending')
    if (!payment) return
    await execute(`payment-${payment.id}`, 'Payment confirmed and added to wallet', () => service.confirmPayment(payment.id, profile))
    setSelected(null)
  }
  const cancel = async () => {
    if (!cancelOrder) return
    await execute(`cancel-${cancelOrder.id}`, 'Order cancelled', () => service.updateOrderStatus(cancelOrder.id, 'cancelled', profile))
    setCancelOrder(null)
    setSelected(null)
  }
  const permanentlyDelete = async () => {
    if (!deletingOrder || deletionConfirmation !== deletingOrder.order_number) return
    const order = deletingOrder
    setDeletionError(null)
    const result = await execute(
      `delete-order-${order.id}`,
      `${order.order_number} permanently deleted`,
      () => service.deleteOrder(order.id, deletionConfirmation),
      ['orders', 'payments', 'customers', 'finance', 'inventory', 'notifications']
    )
    if (!result) return
    if (result.proofCleanupStatus !== 'completed') {
      showToast({ type: 'info', title: 'Order deleted; proof cleanup will retry', message: 'The business records are gone, but a storage cleanup job still needs attention.' })
    }
    setDeletingOrder(null)
  }
  const exportOrders = () => downloadCsv(`AKOCP-orders-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((order) => ({
    'Order ID': order.order_number,
    Customer: order.customer?.name,
    Phone: order.customer?.phone,
    Service: order.service?.code,
    Track: order.track_name,
    Language: order.language,
    Status: statusLabels[order.status],
    Payment: paymentStatusLabels[order.payment_status],
    Amount: order.price,
    'Due Date': order.due_date ?? '',
    Created: order.created_at
  })))

  return (
    <div className="page-stack orders-page">
      <PageHeader eyebrow="Customer workflow" title="Orders" description="Search inventory first, capture payment, create once, and reuse the track." action={<div className="button-row"><Button variant="secondary" icon={<Download size={16} />} onClick={exportOrders}>Export CSV</Button><Button icon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>New order</Button></div>} />
      <div className="summary-strip">
        <div><ClipboardCheck size={19} /><span><strong>{snapshot.orders.filter((order) => ['inquiry', 'payment_pending', 'in_progress'].includes(order.status)).length}</strong>Active orders</span></div>
        <div><CircleDollarSign size={19} /><span><strong>{pendingPayments}</strong>Proofs to confirm</span></div>
        <div><CalendarDays size={19} /><span><strong>{dueSoon}</strong>Due within 48 hours</span></div>
        <div><PackageCheck size={19} /><span><strong>{snapshot.orders.filter((order) => order.status === 'completed').length}</strong>Ready to deliver</span></div>
      </div>
      {dashboardView && <div className="form-notice"><span>Showing {({overdue:'overdue orders',due_today:'orders due today',payment_review:'orders with payment proofs awaiting review',unpaid:'orders with unconfirmed quote balances',balance_review:'orders with payment differences to review',unassigned:'unassigned open orders',revisions:'orders with revision requests'} as Record<string,string>)[dashboardView]??dashboardView}</span><Button variant="ghost" onClick={()=>setDashboardView('')}>Clear dashboard filter</Button></div>}
      <div className="ops-view-switch" role="group" aria-label="Order display"><button aria-pressed={viewMode==='board'} onClick={()=>setViewMode('board')}>Workflow board</button><button aria-pressed={viewMode==='list'} onClick={()=>setViewMode('list')}>List</button></div>
      <Card className="table-card orders-table-card">
        <div className="table-toolbar">
          <div className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, customer, phone or track…" /></div>
          <div className="filter-select"><Filter size={16} /><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{statuses.map((item) => <option key={item} value={item}>{item === 'all' ? 'All statuses' : statusLabels[item]}</option>)}</select></div>
          <span className="result-count">{filtered.length} order{filtered.length === 1 ? '' : 's'}</span>
        </div>
        {viewMode==='board'?<OrderBoard orders={filtered} payments={snapshot.payments} onOpen={openDetails}/>:filtered.length ? <>
          <div className="responsive-table order-table"><table><thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Due date</th><th>Payment</th><th>Status</th><th className="align-right">Amount</th><th /></tr></thead><tbody>{filtered.slice(0,visibleRows).map((order) => <tr key={order.id} onClick={() => openDetails(order)}><td><strong>{order.order_number}</strong><small>{fromNow(order.created_at)}</small></td><td><strong>{order.customer?.name ?? 'Unknown'}</strong><small>{order.customer?.phone}</small></td><td><span className="service-code">{order.service?.code}</span><small>{order.track_name}</small></td><td>{formatDate(order.due_date)}<small>{order.language}</small></td><td><StatusBadge status={order.payment_status} /></td><td><StatusBadge status={order.status} /></td><td className="align-right"><strong>{formatCurrency(order.price)}</strong></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table></div>
          <div className="mobile-order-list">{filtered.slice(0,visibleRows).map((order) => <button key={order.id} onClick={() => openDetails(order)}><div className="mobile-order-top"><span><strong>{order.order_number}</strong><small>{fromNow(order.created_at)}</small></span><b>{formatCurrency(order.price)}</b></div><h3>{order.track_name}</h3><p>{order.customer?.name} · {order.language}</p><div><StatusBadge status={order.status} /><StatusBadge status={order.payment_status} /></div></button>)}</div>
          {filtered.length>visibleRows&&<Button variant="ghost" onClick={()=>setVisibleRows(n=>n+50)}>Show {Math.min(50,filtered.length-visibleRows)} more orders</Button>}
        </> : <EmptyState icon={<ClipboardCheck size={25} />} title="No matching orders" description="Adjust the filters or create a new customer order." action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New order</Button>} />}
      </Card>

      <CreateOrderModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <OrderDetailsModal
        order={selectedCurrent}
        onClose={() => setSelected(null)}
        onUpload={() => { setPaymentOrder(selected); setSelected(null) }}
        onConfirm={() => selected && void confirmPayment(selected)}
        onComplete={() => { setCompleteOrder(selected); setSelected(null) }}
        onDeliver={() => selected && void changeStatus(selected, 'delivered')}
        onProgress={() => selected && void changeStatus(selected, 'in_progress')}
        onCancel={() => { setCancelOrder(selected); setSelected(null) }}
        onDelete={() => { setDeletingOrder(selected); setSelected(null) }}
        canConfirm={profile.role === 'founder'}
        canDelete={profile.role === 'founder'}
        loading={Boolean(selected && busyAction?.includes(selected.id))}
      />
      <PaymentModal order={paymentOrder} handoff={paymentHandoff} onClose={() => { setPaymentOrder(null); setPaymentHandoff(null); sessionStorage.removeItem('akocp-ai-payment') }} />
      <CompleteOrderModal order={completeOrder} onClose={() => setCompleteOrder(null)} />
      <ConfirmDialog open={Boolean(cancelOrder)} onClose={() => setCancelOrder(null)} onConfirm={() => void cancel()} title="Cancel this order?" message={`${cancelOrder?.order_number ?? 'This order'} will remain in the audit trail, but no longer count as active.`} confirmLabel="Cancel order" danger loading={Boolean(cancelOrder && busyAction === `cancel-${cancelOrder.id}`)} />
      <Modal open={Boolean(deletingOrder)} onClose={() => !deletionLoading && setDeletingOrder(null)} title="Permanently delete order?" description="Founder-only irreversible deletion" size="md" footer={<><Button variant="ghost" disabled={deletionLoading} onClick={() => setDeletingOrder(null)}>Cancel</Button><Button variant="danger" icon={<Trash2 size={16} />} loading={busyAction === `delete-order-${deletingOrder?.id}`} disabled={!deletionPreview || deletionConfirmation !== deletingOrder?.order_number} onClick={() => void permanentlyDelete()}>Permanently delete</Button></>}>
        <div className="privacy-purge-warning"><span><AlertTriangle size={22} /></span><div><strong>This cannot be undone</strong><p>The order, every linked payment, confirmed wallet revenue, proof files, notifications, proposals, and detailed audit entries will be removed. The customer and reusable inventory track remain, with totals recalculated.</p></div></div>
        {deletionLoading && !deletionPreview ? <div className="purge-loading"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div> : deletionPreview && <><div className="purge-counts">{Object.entries(deletionPreview.affected).map(([label, count]) => <div key={label}><span>{label.replace(/([A-Z])/g, ' $1')}</span><strong>{count}</strong></div>)}</div><div className="form-notice"><CircleDollarSign size={16} /> {formatCurrency(deletionPreview.removedFinancialAmount)} confirmed revenue will be removed from the wallet and reports.</div><Input label={`Type “${deletingOrder?.order_number}” to confirm`} value={deletionConfirmation} onChange={(event) => setDeletionConfirmation(event.target.value)} autoComplete="off" /></>}
        {deletionError && <div className="form-alert error">{deletionError}</div>}
      </Modal>
    </div>
  )
}

function OrderDetailsModal({ order, onClose, onUpload, onConfirm, onComplete, onDeliver, onProgress, onCancel, onDelete, canConfirm, canDelete, loading }: { order: Order | null; onClose(): void; onUpload(): void; onConfirm(): void; onComplete(): void; onDeliver(): void; onProgress(): void; onCancel(): void; onDelete(): void; canConfirm: boolean; canDelete: boolean; loading: boolean }) {
  const { snapshot } = useAppData()
  const customer = snapshot?.customers.find(item => item.id === order?.customer_id)
  if (!order) return null
  return (
    <Modal open={Boolean(order)} onClose={onClose} title={order.order_number} description={`${order.track_name} · ${order.language}`} size="lg">
      <div className="order-detail-hero"><div><span className="service-code large">{order.service?.code}</span><div><strong>{order.service?.name}</strong><small>Created {formatDate(order.created_at, 'long')}</small></div></div><strong>{formatCurrency(order.price)}</strong></div>
      <div className="detail-status-row"><div><span>Order status</span><StatusBadge status={order.status} /></div><div><span>Payment</span><StatusBadge status={order.payment_status} /></div></div>
      <div className="detail-grid"><div><UserRound size={17} /><span><small>Customer</small><strong>{order.customer?.name}</strong><a href={`tel:${order.customer?.phone}`}>{order.customer?.phone}</a>{(customer?.place || customer?.age != null) && <em>{[customer?.place, customer?.age != null ? `${customer.age} years old` : null].filter(Boolean).join(" · ")}</em>}</span></div><div><CalendarDays size={17} /><span><small>Due date</small><strong>{formatDate(order.due_date)}</strong><em>{order.assignee?.full_name ? `Assigned to ${order.assignee.full_name}` : 'Unassigned'}</em></span></div><div><Music2 size={17} /><span><small>Inventory</small><strong>{order.inventory_track_id ? 'Existing track' : 'New creation'}</strong><em>{order.track_name}</em></span></div><div><MessageCircle size={17} /><span><small>Notes</small><strong>{order.notes || 'No notes added'}</strong></span></div></div>
      <OrderPayments order={order} onUpload={onUpload}/>
      {customer&&<FollowupComposer customer={customer} order={order}/>}
      <OrderOperations order={order}/>
      <div className="detail-actions">
        {order.payment_status === 'proof_uploaded' && canConfirm && <Button icon={<CircleDollarSign size={16} />} loading={loading} onClick={onConfirm}>Confirm payment</Button>}
        {order.payment_status === 'confirmed' && ['inquiry', 'payment_pending'].includes(order.status) && <Button icon={<Send size={16} />} onClick={onProgress}>Start production</Button>}
        {order.payment_status === 'confirmed' && order.status === 'in_progress' && <Button icon={<CheckCircle2 size={16} />} onClick={onComplete}>Mark complete</Button>}
        {order.status === 'completed' && <Button icon={<PackageCheck size={16} />} onClick={onDeliver}>Mark delivered</Button>}
        {!['completed', 'delivered', 'cancelled'].includes(order.status) && <Button variant="danger" icon={<XCircle size={16} />} onClick={onCancel}>Cancel order</Button>}
        {canDelete && <Button variant="danger" icon={<Trash2 size={16} />} onClick={onDelete}>Delete order</Button>}
      </div>
    </Modal>
  )
}

function PaymentModal({ order, handoff, onClose }: { order: Order | null; handoff?: { proposalId: string; amount: number; upiReference: string } | null; onClose(): void }) {
  const { profile } = useAuth()
  const { service, execute, busyAction,snapshot } = useAppData()
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const initializedPayment=useRef<string|null>(null)
  useEffect(() => { if(!order){initializedPayment.current=null;return} const key=order.id+(handoff?.proposalId??'');if(initializedPayment.current===key)return;initializedPayment.current=key; if (order) { setAmount(String(handoff?.amount ?? (snapshot?Math.max(orderBalance(order,snapshot.payments).balance-orderBalance(order,snapshot.payments).pending,0):order.price))); setReference(handoff?.upiReference ?? ''); setFile(null) } }, [handoff, order,snapshot])
  if (!order || !profile) return null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    let succeeded = false
    await execute(`upload-${order.id}`, 'Payment proof uploaded for confirmation', async () => {
      let claimed = false
      try {
        if (handoff) {
          await aiService.claimProposal(handoff.proposalId)
          claimed = true
        }
        await service.uploadPayment(order.id, Number(amount), reference, file, profile)
        if (handoff) await aiService.finishProposal(handoff.proposalId, true, { completedAt: new Date().toISOString() })
        succeeded = true
      } catch (error) {
        if (handoff && claimed) {
          await aiService.finishProposal(handoff.proposalId, false, {
            failedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Payment proof upload failed'
          }).catch(() => undefined)
        }
        throw error
      }
    })
    if (succeeded) onClose()
  }
  return (
    <Modal open={Boolean(order)} onClose={onClose} title="Upload payment proof" description={`${order.order_number} · ${order.customer?.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="payment-form" type="submit" loading={busyAction === `upload-${order.id}`}>Submit proof</Button></>}>
      <form id="payment-form" onSubmit={submit} className="form-stack"><div className="payment-amount"><span>Order value</span><strong>{formatCurrency(order.price)}</strong></div><Input label="Amount received" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /><Input label="UPI reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional transaction reference" /><label className="file-drop"><FileImage size={24} /><strong>{file ? file.name : 'Add payment screenshot'}</strong><span>PNG, JPG or WebP up to 5 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><p className="form-notice">The wallet changes only after a Founder confirms this payment.</p></form>
    </Modal>
  )
}

function CompleteOrderModal({ order, onClose }: { order: Order | null; onClose(): void }) {
  const { profile } = useAuth()
  const { service, execute, busyAction } = useAppData()
  const [addToInventory, setAddToInventory] = useState(true)
  const [englishTitle, setEnglishTitle] = useState('')
  const [malayalamTitle, setMalayalamTitle] = useState('')
  const [tags, setTags] = useState('')
  const [filePath, setFilePath] = useState('')
  useEffect(() => { if (order) { setAddToInventory(!order.inventory_track_id); setEnglishTitle(order.track_name); setMalayalamTitle(''); setTags(''); setFilePath('') } }, [order])
  if (!order || !profile) return null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await execute(`complete-${order.id}`, 'Order completed successfully', () => service.completeOrder(order.id, addToInventory, addToInventory ? { trackName: order.track_name, englishTitle, malayalamTitle, language: order.language, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), filePath, createdFromOrderId: order.id } : null, profile))
    onClose()
  }
  return (
    <Modal open={Boolean(order)} onClose={onClose} title="Complete karaoke order" description="Confirm completion and decide whether this track becomes a reusable asset." size="lg" footer={<><Button variant="ghost" onClick={onClose}>Not yet</Button><Button form="complete-form" type="submit" loading={busyAction === `complete-${order.id}`}>Complete order</Button></>}>
      <form id="complete-form" onSubmit={submit} className="form-stack"><div className="completion-question"><span><Music2 size={22} /></span><div><strong>Add “{order.track_name}” to inventory?</strong><p>Future orders can find and sell it as ready-made karaoke.</p></div><label className="switch"><input type="checkbox" checked={addToInventory} onChange={(event) => setAddToInventory(event.target.checked)} disabled={Boolean(order.inventory_track_id)} /><i /></label></div>{addToInventory && !order.inventory_track_id && <div className="inventory-details"><div className="form-grid two"><Input label="English / Manglish title" value={englishTitle} onChange={(event) => setEnglishTitle(event.target.value)} required /><Input label="Malayalam title" value={malayalamTitle} onChange={(event) => setMalayalamTitle(event.target.value)} placeholder="Optional" /></div><Input label="Search tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="movie, singer, alternate spelling" hint="Separate tags with commas." /><Input label="File path" value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="Drive or storage path (optional)" /></div>}</form>
    </Modal>
  )
}
