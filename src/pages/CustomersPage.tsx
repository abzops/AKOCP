import { AlertTriangle, ArrowUpRight, CircleDollarSign, Crown, Download, Edit3, MessageCircle, Phone, Search, ShoppingBag, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Textarea } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { downloadCsv, formatCurrency, formatDate, initials, normalizeSearch } from '../lib/format'
import type { Customer, CustomerPurgePreview } from '../types'

export function CustomersPage() {
  const { snapshot } = useAppData()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const navigate = useNavigate()
  if (!snapshot) return null
  const filtered = snapshot.customers.filter((customer) => normalizeSearch(`${customer.name} ${customer.phone} ${customer.whatsapp} ${customer.notes}`).includes(normalizeSearch(query)))
  const ranked = [...snapshot.customers].sort((a, b) => b.lifetime_revenue - a.lifetime_revenue)
  const top = ranked[0]
  const repeatCustomers = snapshot.customers.filter((customer) => customer.total_orders > 1).length
  const averageValue = snapshot.customers.length ? snapshot.customers.reduce((sum, customer) => sum + customer.lifetime_revenue, 0) / snapshot.customers.length : 0
  const exportCustomers = () => downloadCsv(`AKOCP-customers-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((customer) => ({ Name: customer.name, Phone: customer.phone, WhatsApp: customer.whatsapp, Orders: customer.total_orders, 'Lifetime Revenue': customer.lifetime_revenue, 'Last Ordered': customer.last_ordered_at, Notes: customer.notes })))
  return (
    <div className="page-stack customers-page">
      <PageHeader eyebrow="Relationship value" title="Customers" description="See repeat business, lifetime value, contact details, and complete order history." action={<div className="button-row"><Button variant="secondary" icon={<Download size={16} />} onClick={exportCustomers}>Export CSV</Button><Button icon={<UserPlus size={17} />} onClick={() => navigate('/orders?new=1')}>New customer order</Button></div>} />
      <div className="customer-insights">
        <Card className="top-customer-card"><div className="crown-icon"><Crown size={22} /></div><div><span>Top customer</span><strong>{top?.name ?? '—'}</strong><small>{top ? `${top.total_orders} orders · ${formatCurrency(top.lifetime_revenue)}` : 'No sales yet'}</small></div><button onClick={() => top && setSelected(top)}><ArrowUpRight size={18} /></button></Card>
        <Card><span className="insight-icon"><UsersRound size={20} /></span><div><span>Total customers</span><strong>{snapshot.customers.length}</strong><small>Active customer records</small></div></Card>
        <Card><span className="insight-icon"><ShoppingBag size={20} /></span><div><span>Repeat customers</span><strong>{repeatCustomers}</strong><small>{snapshot.customers.length ? Math.round(repeatCustomers / snapshot.customers.length * 100) : 0}% retention signal</small></div></Card>
        <Card><span className="insight-icon"><Crown size={20} /></span><div><span>Average lifetime value</span><strong>{formatCurrency(averageValue)}</strong><small>Across all customers</small></div></Card>
      </div>
      <Card className="table-card customer-table-card">
        <div className="table-toolbar"><div className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, WhatsApp or notes…" /></div><span className="result-count">{filtered.length} customer{filtered.length === 1 ? '' : 's'}</span></div>
        {filtered.length ? <div className="customer-grid">{filtered.map((customer) => <button key={customer.id} className="customer-card" onClick={() => setSelected(customer)}><div className="customer-card-top"><span className="avatar large">{initials(customer.name)}</span><div><strong>{customer.name}</strong><small>Customer since {formatDate(customer.created_at)}</small></div>{ranked.indexOf(customer) < 3 && <Badge tone="yellow">#{ranked.indexOf(customer) + 1} value</Badge>}</div><div className="customer-contact"><span><Phone size={15} />{customer.phone}</span><span><MessageCircle size={15} />{customer.whatsapp || customer.phone}</span></div><div className="customer-value"><span><small>Total orders</small><strong>{customer.total_orders}</strong></span><span><small>Lifetime revenue</small><strong>{formatCurrency(customer.lifetime_revenue)}</strong></span><span><small>Last order</small><strong>{formatDate(customer.last_ordered_at)}</strong></span></div>{customer.notes && <p>{customer.notes}</p>}</button>)}</div> : <EmptyState icon={<UsersRound size={24} />} title="No customers found" description="Create an order to add the first customer automatically." />}
      </Card>
      <CustomerModal customer={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function CustomerModal({ customer, onClose }: { customer: Customer | null; onClose(): void }) {
  const { profile } = useAuth()
  const { snapshot, service, execute, busyAction } = useAppData()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [notes, setNotes] = useState('')
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [preview, setPreview] = useState<CustomerPurgePreview | null>(null)
  const [confirmationName, setConfirmationName] = useState('')
  const [purgeLoading, setPurgeLoading] = useState(false)
  const [purgeError, setPurgeError] = useState<string | null>(null)
  const orders = useMemo(() => snapshot?.orders.filter((order) => order.customer_id === customer?.id) ?? [], [customer?.id, snapshot?.orders])

  useEffect(() => {
    setEditing(false)
    setPurgeOpen(false)
    setPreview(null)
    setConfirmationName('')
    setPurgeError(null)
  }, [customer?.id])

  if (!customer || !profile) return null
  const startEdit = () => { setName(customer.name); setWhatsapp(customer.whatsapp ?? ''); setNotes(customer.notes ?? ''); setEditing(true) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await execute(`customer-${customer.id}`, 'Customer updated', () => service.updateCustomer(customer.id, { name, whatsapp, notes }, profile), ['customers', 'orders'])
    setEditing(false)
    onClose()
  }
  const openPurge = async () => {
    setPurgeOpen(true)
    setPurgeLoading(true)
    setPurgeError(null)
    try {
      setPreview(await service.previewCustomerPurge(customer.id))
    } catch (error) {
      setPurgeError(error instanceof Error ? error.message : 'Could not prepare the privacy purge.')
    } finally {
      setPurgeLoading(false)
    }
  }
  const confirmPurge = async () => {
    if (confirmationName !== customer.name) return
    setPurgeLoading(true)
    setPurgeError(null)
    try {
      const result = await service.purgeCustomer(customer.id, confirmationName)
      setPurgeOpen(false)
      onClose()
      await execute(`purge-${customer.id}`, result.proofCleanupStatus === 'completed' ? 'Customer permanently deleted' : 'Customer deleted; proof cleanup will retry', async () => result, ['customers', 'orders', 'payments', 'recordedSales', 'finance', 'inventory', 'notifications'])
    } catch (error) {
      setPurgeError(error instanceof Error ? error.message : 'Customer privacy purge failed.')
    } finally {
      setPurgeLoading(false)
    }
  }
  const footer = editing
    ? <><Button variant="ghost" onClick={() => setEditing(false)}>Cancel edit</Button><Button form="customer-edit-form" type="submit" loading={busyAction === `customer-${customer.id}`}>Save changes</Button></>
    : <div className="customer-modal-actions">{profile.role === 'founder' && <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => void openPurge()}>Delete customer</Button>}<Button variant="secondary" icon={<Edit3 size={16} />} onClick={startEdit}>Edit customer</Button></div>

  return (
    <>
      <Modal open={Boolean(customer) && !purgeOpen} onClose={onClose} title={customer.name} description={`Customer since ${formatDate(customer.created_at)}`} size="lg" footer={footer}>
        {editing ? <form id="customer-edit-form" onSubmit={submit} className="form-stack"><Input label="Customer name" value={name} onChange={(event) => setName(event.target.value)} required /><Input label="WhatsApp number" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} inputMode="numeric" /><Textarea label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Preferences, context or follow-up notes…" /></form>
          : <><div className="customer-modal-hero"><span className="avatar xl">{initials(customer.name)}</span><div><a href={`tel:${customer.phone}`}><Phone size={16} />{customer.phone}</a><a href={`https://wa.me/${customer.whatsapp || customer.phone}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />Open WhatsApp</a></div><div><span>Lifetime value</span><strong>{formatCurrency(customer.lifetime_revenue)}</strong><small>{customer.total_orders} total orders</small></div></div>{customer.notes && <div className="customer-notes"><span>Customer notes</span><p>{customer.notes}</p></div>}<div className="modal-section-heading"><h3>Order history</h3><Badge>{orders.length} orders</Badge></div><div className="history-list">{orders.map((order) => <div key={order.id}><span className="service-code">{order.service?.code}</span><div><strong>{order.track_name}</strong><small>{order.order_number} · {formatDate(order.created_at)}</small></div><b>{formatCurrency(order.price)}</b></div>)}</div></>}
      </Modal>
      <Modal open={purgeOpen} onClose={() => !purgeLoading && setPurgeOpen(false)} title="Permanently delete customer?" description="Founder-only privacy purge" size="md" footer={<><Button variant="ghost" disabled={purgeLoading} onClick={() => setPurgeOpen(false)}>Cancel</Button><Button variant="danger" icon={<Trash2 size={16} />} loading={purgeLoading} disabled={!preview || confirmationName !== customer.name} onClick={() => void confirmPurge()}>Permanently delete</Button></>}>
        <div className="privacy-purge-warning"><span><AlertTriangle size={22} /></span><div><strong>This cannot be undone</strong><p>Customer identity and operational history will be removed. Anonymous wallet totals and reusable inventory assets will remain.</p></div></div>
        {purgeLoading && !preview ? <div className="purge-loading"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div> : preview && <><div className="purge-counts">{Object.entries(preview.affected).map(([label, count]) => <div key={label}><span>{label.replace(/([A-Z])/g, ' $1')}</span><strong>{count}</strong></div>)}</div><div className="form-notice"><CircleDollarSign size={16} /> {formatCurrency(preview.retainedFinancialAmount)} remains in anonymous financial history.</div><Input label={`Type “${customer.name}” to confirm`} value={confirmationName} onChange={(event) => setConfirmationName(event.target.value)} autoComplete="off" /></>}
        {purgeError && <div className="form-alert error">{purgeError}</div>}
      </Modal>
    </>
  )
}
