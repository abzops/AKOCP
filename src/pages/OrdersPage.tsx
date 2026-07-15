import { CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, Download, FileImage, Filter, MessageCircle, Music2, PackageCheck, Plus, Search, Send, UserRound, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, PageHeader, Select, StatusBadge, Textarea, cn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { downloadCsv, formatCurrency, formatDate, fromNow, normalizeSearch, paymentStatusLabels, statusLabels } from '../lib/format'
import type { CreateOrderInput, InventoryTrack, Order, OrderStatus } from '../types'

const languages = ['Malayalam', 'Tamil', 'Hindi', 'English', 'Kannada', 'Telugu', 'Other']
const statuses: Array<'all' | OrderStatus> = ['all', 'inquiry', 'payment_pending', 'in_progress', 'completed', 'delivered', 'cancelled']

const emptyOrderForm: CreateOrderInput = {
  customerName: '', phone: '', whatsapp: '', customerNotes: '', serviceId: '', inventoryTrackId: '', trackName: '', language: 'Malayalam', dueDate: '', assignedTo: '', notes: ''
}

export function OrdersPage() {
  const { profile } = useAuth()
  const { snapshot, service, execute, busyAction } = useAppData()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | OrderStatus>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Order | null>(null)
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null)
  const [completeOrder, setCompleteOrder] = useState<Order | null>(null)
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)

  useEffect(() => {
    if (params.get('new') === '1') {
      setCreateOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  if (!snapshot || !profile) return null
  const filtered = snapshot.orders.filter((order) => {
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
      <Card className="table-card orders-table-card">
        <div className="table-toolbar">
          <div className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, customer, phone or track…" /></div>
          <div className="filter-select"><Filter size={16} /><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{statuses.map((item) => <option key={item} value={item}>{item === 'all' ? 'All statuses' : statusLabels[item]}</option>)}</select></div>
          <span className="result-count">{filtered.length} order{filtered.length === 1 ? '' : 's'}</span>
        </div>
        {filtered.length ? <>
          <div className="responsive-table order-table"><table><thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Due date</th><th>Payment</th><th>Status</th><th className="align-right">Amount</th><th /></tr></thead><tbody>{filtered.map((order) => <tr key={order.id} onClick={() => openDetails(order)}><td><strong>{order.order_number}</strong><small>{fromNow(order.created_at)}</small></td><td><strong>{order.customer?.name ?? 'Unknown'}</strong><small>{order.customer?.phone}</small></td><td><span className="service-code">{order.service?.code}</span><small>{order.track_name}</small></td><td>{formatDate(order.due_date)}<small>{order.language}</small></td><td><StatusBadge status={order.payment_status} /></td><td><StatusBadge status={order.status} /></td><td className="align-right"><strong>{formatCurrency(order.price)}</strong></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table></div>
          <div className="mobile-order-list">{filtered.map((order) => <button key={order.id} onClick={() => openDetails(order)}><div className="mobile-order-top"><span><strong>{order.order_number}</strong><small>{fromNow(order.created_at)}</small></span><b>{formatCurrency(order.price)}</b></div><h3>{order.track_name}</h3><p>{order.customer?.name} · {order.language}</p><div><StatusBadge status={order.status} /><StatusBadge status={order.payment_status} /></div></button>)}</div>
        </> : <EmptyState icon={<ClipboardCheck size={25} />} title="No matching orders" description="Adjust the filters or create a new customer order." action={<Button icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>New order</Button>} />}
      </Card>

      <CreateOrderModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <OrderDetailsModal
        order={selected}
        onClose={() => setSelected(null)}
        onUpload={() => { setPaymentOrder(selected); setSelected(null) }}
        onConfirm={() => selected && void confirmPayment(selected)}
        onComplete={() => { setCompleteOrder(selected); setSelected(null) }}
        onDeliver={() => selected && void changeStatus(selected, 'delivered')}
        onProgress={() => selected && void changeStatus(selected, 'in_progress')}
        onCancel={() => { setCancelOrder(selected); setSelected(null) }}
        canConfirm={profile.role === 'founder'}
        loading={Boolean(selected && busyAction?.includes(selected.id))}
      />
      <PaymentModal order={paymentOrder} onClose={() => setPaymentOrder(null)} />
      <CompleteOrderModal order={completeOrder} onClose={() => setCompleteOrder(null)} />
      <ConfirmDialog open={Boolean(cancelOrder)} onClose={() => setCancelOrder(null)} onConfirm={() => void cancel()} title="Cancel this order?" message={`${cancelOrder?.order_number ?? 'This order'} will remain in the audit trail, but no longer count as active.`} confirmLabel="Cancel order" danger loading={Boolean(cancelOrder && busyAction === `cancel-${cancelOrder.id}`)} />
    </div>
  )
}

function CreateOrderModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { profile } = useAuth()
  const { snapshot, service, execute, busyAction } = useAppData()
  const [form, setForm] = useState<CreateOrderInput>(emptyOrderForm)
  const [trackSearch, setTrackSearch] = useState('')
  const [selectedTrack, setSelectedTrack] = useState<InventoryTrack | null>(null)
  if (!snapshot || !profile) return null
  const update = (key: keyof CreateOrderInput, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const matches = trackSearch.trim().length >= 2 ? snapshot.tracks.filter((track) => normalizeSearch(`${track.track_name} ${track.english_title} ${track.malayalam_title} ${track.tags.join(' ')}`).includes(normalizeSearch(trackSearch))).slice(0, 6) : []
  const existingService = snapshot.services.find((item) => item.code === 'EX250')
  const customerMatch = snapshot.customers.find((customer) => customer.phone === form.phone.replace(/\D/g, '').slice(-10))
  const chooseTrack = (track: InventoryTrack) => {
    setSelectedTrack(track)
    setTrackSearch(track.track_name)
    setForm((current) => ({ ...current, inventoryTrackId: track.id, trackName: track.track_name, language: track.language, serviceId: existingService?.id ?? current.serviceId }))
  }
  const clearTrack = () => {
    setSelectedTrack(null)
    setTrackSearch('')
    setForm((current) => ({ ...current, inventoryTrackId: '', trackName: '', serviceId: '' }))
  }
  const applyCustomer = () => {
    if (!customerMatch) return
    setForm((current) => ({ ...current, customerName: customerMatch.name, whatsapp: customerMatch.whatsapp ?? '', customerNotes: customerMatch.notes ?? '' }))
  }
  const close = () => { setForm(emptyOrderForm); setTrackSearch(''); setSelectedTrack(null); onClose() }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const submitted = { ...form, phone: form.phone.replace(/\D/g, '').slice(-10), whatsapp: form.whatsapp?.replace(/\D/g, '').slice(-10) }
    await execute('create-order', 'Order created successfully', () => service.createOrder(submitted, profile))
    close()
  }
  const chosenService = snapshot.services.find((item) => item.id === form.serviceId)
  return (
    <Modal open={open} onClose={close} title="Create customer order" description="Start by checking whether this karaoke already exists." size="xl" footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="create-order-form" type="submit" loading={busyAction === 'create-order'}>Create order · {formatCurrency(chosenService?.price ?? 0)}</Button></>}>
      <form id="create-order-form" onSubmit={submit} className="form-stack">
        <section className="form-section inventory-first"><div className="form-section-heading"><span>1</span><div><h3>Search karaoke inventory</h3><p>Avoid creating a track that the business already owns.</p></div></div>
          <div className="inventory-picker"><div className="inventory-search-input"><Search size={18} /><input value={trackSearch} onChange={(event) => { const value = event.target.value; setTrackSearch(value); if (selectedTrack) { setSelectedTrack(null); setForm((current) => ({ ...current, inventoryTrackId: '', trackName: '', serviceId: '' })) } }} placeholder="Malayalam, English or Manglish title…" />{selectedTrack && <button type="button" onClick={clearTrack}><XCircle size={18} /></button>}</div>
            {selectedTrack ? <div className="selected-track"><span><Music2 size={20} /></span><div><strong>{selectedTrack.track_name}</strong><small>{selectedTrack.malayalam_title || selectedTrack.english_title} · {selectedTrack.language}</small></div><Badge tone="green">Existing asset</Badge></div>
              : matches.length > 0 ? <div className="inventory-results">{matches.map((track) => <button type="button" key={track.id} onClick={() => chooseTrack(track)}><span><Music2 size={17} /></span><div><strong>{track.track_name}</strong><small>{track.malayalam_title || track.english_title} · {track.total_orders} orders · {formatCurrency(track.lifetime_revenue)}</small></div><b>Use track</b></button>)}</div>
                : trackSearch.trim().length >= 2 && <div className="no-track-match"><span>No matching asset found.</span><small>Continue below to create a custom karaoke order.</small></div>}
          </div>
        </section>
        <section className="form-section"><div className="form-section-heading"><span>2</span><div><h3>Customer & track</h3><p>Capture contact and delivery information.</p></div></div>
          <div className="form-grid three"><div className="phone-field"><Input label="Phone number" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="10-digit number" inputMode="numeric" pattern="[0-9 +()-]{10,}" required />{customerMatch && <button type="button" onClick={applyCustomer}>Use {customerMatch.name}</button>}</div><Input label="Customer name" value={form.customerName} onChange={(event) => update('customerName', event.target.value)} placeholder="Full name" required /><Input label="WhatsApp" value={form.whatsapp} onChange={(event) => update('whatsapp', event.target.value)} placeholder="Defaults to phone" inputMode="numeric" /></div>
          <div className="form-grid three"><Input label="Track name" value={form.trackName} onChange={(event) => update('trackName', event.target.value)} placeholder="Song title" required disabled={Boolean(selectedTrack)} /><Select label="Language" value={form.language} onChange={(event) => update('language', event.target.value)} required disabled={Boolean(selectedTrack)}>{languages.map((language) => <option key={language}>{language}</option>)}</Select><Input label="Due date" type="date" value={form.dueDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => update('dueDate', event.target.value)} /></div>
        </section>
        <section className="form-section"><div className="form-section-heading"><span>3</span><div><h3>Service & ownership</h3><p>The price is controlled by the selected service.</p></div></div>
          <div className="form-grid two"><Select label="Service" value={form.serviceId} onChange={(event) => update('serviceId', event.target.value)} required><option value="">Choose service</option>{snapshot.services.filter((item) => item.active && (selectedTrack || item.code !== 'EX250')).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} · {formatCurrency(item.price)}</option>)}</Select><Select label="Assign to" value={form.assignedTo} onChange={(event) => update('assignedTo', event.target.value)}><option value="">Assign to me</option>{snapshot.profiles.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.role}</option>)}</Select></div>
          <Textarea label="Order notes" value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Customer request, timing, key or production notes…" rows={3} />
        </section>
      </form>
    </Modal>
  )
}

function OrderDetailsModal({ order, onClose, onUpload, onConfirm, onComplete, onDeliver, onProgress, onCancel, canConfirm, loading }: { order: Order | null; onClose(): void; onUpload(): void; onConfirm(): void; onComplete(): void; onDeliver(): void; onProgress(): void; onCancel(): void; canConfirm: boolean; loading: boolean }) {
  if (!order) return null
  return (
    <Modal open={Boolean(order)} onClose={onClose} title={order.order_number} description={`${order.track_name} · ${order.language}`} size="lg">
      <div className="order-detail-hero"><div><span className="service-code large">{order.service?.code}</span><div><strong>{order.service?.name}</strong><small>Created {formatDate(order.created_at, 'long')}</small></div></div><strong>{formatCurrency(order.price)}</strong></div>
      <div className="detail-status-row"><div><span>Order status</span><StatusBadge status={order.status} /></div><div><span>Payment</span><StatusBadge status={order.payment_status} /></div></div>
      <div className="detail-grid"><div><UserRound size={17} /><span><small>Customer</small><strong>{order.customer?.name}</strong><a href={`tel:${order.customer?.phone}`}>{order.customer?.phone}</a></span></div><div><CalendarDays size={17} /><span><small>Due date</small><strong>{formatDate(order.due_date)}</strong><em>{order.assignee?.full_name ? `Assigned to ${order.assignee.full_name}` : 'Unassigned'}</em></span></div><div><Music2 size={17} /><span><small>Inventory</small><strong>{order.inventory_track_id ? 'Existing track' : 'New creation'}</strong><em>{order.track_name}</em></span></div><div><MessageCircle size={17} /><span><small>Notes</small><strong>{order.notes || 'No notes added'}</strong></span></div></div>
      <div className="detail-actions">
        {order.payment_status === 'unpaid' && order.status !== 'cancelled' && <Button icon={<FileImage size={16} />} onClick={onUpload}>Upload payment proof</Button>}
        {order.payment_status === 'proof_uploaded' && canConfirm && <Button icon={<CircleDollarSign size={16} />} loading={loading} onClick={onConfirm}>Confirm payment</Button>}
        {order.payment_status === 'confirmed' && ['inquiry', 'payment_pending'].includes(order.status) && <Button icon={<Send size={16} />} onClick={onProgress}>Start production</Button>}
        {order.payment_status === 'confirmed' && order.status === 'in_progress' && <Button icon={<CheckCircle2 size={16} />} onClick={onComplete}>Mark complete</Button>}
        {order.status === 'completed' && <Button icon={<PackageCheck size={16} />} onClick={onDeliver}>Mark delivered</Button>}
        {!['completed', 'delivered', 'cancelled'].includes(order.status) && <Button variant="danger" icon={<XCircle size={16} />} onClick={onCancel}>Cancel order</Button>}
      </div>
    </Modal>
  )
}

function PaymentModal({ order, onClose }: { order: Order | null; onClose(): void }) {
  const { profile } = useAuth()
  const { service, execute, busyAction } = useAppData()
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  useEffect(() => { if (order) { setAmount(String(order.price)); setReference(''); setFile(null) } }, [order])
  if (!order || !profile) return null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await execute(`upload-${order.id}`, 'Payment proof uploaded for confirmation', () => service.uploadPayment(order.id, Number(amount), reference, file, profile))
    onClose()
  }
  return (
    <Modal open={Boolean(order)} onClose={onClose} title="Upload payment proof" description={`${order.order_number} · ${order.customer?.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="payment-form" type="submit" loading={busyAction === `upload-${order.id}`}>Submit proof</Button></>}>
      <form id="payment-form" onSubmit={submit} className="form-stack"><div className="payment-amount"><span>Order value</span><strong>{formatCurrency(order.price)}</strong></div><Input label="Amount received" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /><Input label="UPI reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional transaction reference" /><label className="file-drop"><FileImage size={24} /><strong>{file ? file.name : 'Add payment screenshot'}</strong><span>PNG, JPG or WebP up to 5 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><p className="form-notice">The wallet changes only after a Founder confirms this payment.</p></form>
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
