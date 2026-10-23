import { Music2, XCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { formatCurrency } from '../lib/format'
import { normalizePhone } from '../lib/phone'
import { acquisitionChannels } from '../lib/operations'
import type { CreateOrderInput, Customer, InventoryTrack } from '../types'
import { Badge, Button, Input, Modal, Select, Textarea, cn } from './ui'

const languages = ['Malayalam', 'Tamil', 'Hindi', 'English', 'Kannada', 'Telugu', 'Other']
const emptyForm: CreateOrderInput = { customerName: '', phone: '', trackName: '', serviceId: '', language: 'Malayalam', place: '', age: '',customPrice:'' }

export function CreateOrderModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { profile } = useAuth()
  const { snapshot, service, execute, busyAction } = useAppData()
  const [form, setForm] = useState<CreateOrderInput>(emptyForm)
  const [selectedTrack, setSelectedTrack] = useState<InventoryTrack | null>(null)
  const [matches, setMatches] = useState<InventoryTrack[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const busy = busyAction === 'create-order'
  const defaultService = snapshot?.services.find(s => s.active && s.code === 'ML350')
  const selectedService = snapshot?.services.find(s => s.id === (form.serviceId || defaultService?.id))
  const orderPrice=form.customPrice?.trim()&&Number.isFinite(Number(form.customPrice))?Number(form.customPrice):selectedService?.price??0

  useEffect(() => {
    if (!open || selectedTrack || form.trackName.trim().length < 2) {
      setMatches([]); setSearching(false); setSearchError(false)
      return
    }
    let active = true
    setSearching(true); setSearchError(false); setMatches([])
    const timer = window.setTimeout(() => {
      service.searchInventory({ query: form.trackName, sort: 'orders', limit: 5 })
        .then(result => { if (active) setMatches(result.items) })
        .catch(() => { if (active) setSearchError(true) })
        .finally(() => { if (active) setSearching(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, selectedTrack, form.trackName, service])

  if (!snapshot || !profile) return null
  const customerMatches = form.phone.replace(/\D/g, '').length >= 10
    ? snapshot.customers.filter(c => normalizePhone(c.phone) === normalizePhone(form.phone)) : []
  const update = (key: keyof CreateOrderInput, value: string) => setForm(current => ({ ...current, [key]: value }))
  const applyCustomer = (customer: Customer) => {
    setCustomerId(customer.id)
    setFormError(null)
    setForm(current => ({ ...current, phone: customer.phone, customerName: customer.name,
      whatsapp: customer.whatsapp ?? '', customerNotes: customer.notes ?? '',
      place: customer.place ?? '', age: customer.age == null ? '' : String(customer.age) }))
  }
  const chooseTrack = (track: InventoryTrack) => {
    const ready = snapshot.services.find(s => s.active && s.code === 'EX250')
    if (!ready) return
    setSelectedTrack(track)
    setForm(current => ({ ...current, trackName: track.track_name, language: track.language, inventoryTrackId: track.id, serviceId: ready.id }))
  }
  const chooseService = (code: string) => {
    const next = snapshot.services.find(s => s.active && s.code === code)
    if (!next) return
    setSelectedTrack(null)
    setForm(current => ({ ...current, inventoryTrackId: '', serviceId: next.id }))
  }
  const close = () => {
    if (busy) return
    setForm(emptyForm); setSelectedTrack(null); setMatches([]); setCustomerId(null); setDetailsOpen(false); setFormError(null); onClose()
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !selectedService) return
    if(form.customPrice?.trim()){
      const amount=Number(form.customPrice)
      if(!Number.isFinite(amount)||amount<=0||amount>9999999999.99||Math.abs(amount*100-Math.round(amount*100))>0.0001){setFormError('Enter a custom price greater than zero, with at most two decimal places.');return}
    }
    const chosenCustomer = customerMatches.find(c => c.id === customerId) ?? (customerMatches.length === 1 ? customerMatches[0] : null)
    if (customerMatches.length > 1 && !chosenCustomer) { setFormError('Choose the returning customer above. More than one customer uses this phone.'); return }
    if (chosenCustomer && chosenCustomer.name.trim().toLocaleLowerCase() !== form.customerName.trim().toLocaleLowerCase()) { setFormError(`Use ${chosenCustomer.name} above to keep this phone linked to the existing customer. You can change their name in Customers.`); return }
    setFormError(null)
    const saved = await execute('create-order', 'Order created successfully', async () => {
      await service.createOrder({ ...form, customerName: chosenCustomer?.name ?? form.customerName.trim(), serviceId: selectedService.id,
        phone: chosenCustomer?.phone ?? normalizePhone(form.phone),
        whatsapp: form.whatsapp ? normalizePhone(form.whatsapp) : undefined }, profile)
      return true
    })
    if (saved) { setForm(emptyForm); setSelectedTrack(null); setMatches([]); setCustomerId(null); setDetailsOpen(false); setFormError(null); onClose() }
  }
  const videoCode = form.language === 'Malayalam' ? 'ML350' : 'OL450'
  const audio = snapshot.services.find(s => s.active && s.code === 'AU150')
  const video = snapshot.services.find(s => s.active && s.code === videoCode)
  return <Modal open={open} onClose={close} title="New order" description="Add the customer, choose a song, and save." size="lg" footer={<><Button variant="ghost" disabled={busy} onClick={close}>Cancel</Button><Button form="create-order-form" type="submit" disabled={!selectedService} loading={busy}>Create order · {formatCurrency(orderPrice)}</Button></>}>
    <form id="create-order-form" className="form-stack quick-order-form" onSubmit={submit}>
      {formError && <div className="form-alert error" role="alert">{formError}</div>}
      <div className="form-grid two">
        <Input label="Phone number" type="tel" autoComplete="tel" value={form.phone} placeholder="Phone or country code + number" pattern="[0-9 +()-]{10,}" required onChange={event => { update('phone',event.target.value); setCustomerId(null) }} onBlur={() => { if (!form.customerName.trim() && customerMatches.length === 1) applyCustomer(customerMatches[0]) }} />
        <Input label="Customer name" autoComplete="name" value={form.customerName} minLength={2} required placeholder="Customer name" onChange={event => update('customerName',event.target.value)} />
      </div>
      {customerMatches.length > 0 && <div className="quick-customer-matches"><small>{customerMatches.length === 1 ? 'Returning customer' : 'Choose the customer for this phone'}</small>{customerMatches.map(customer => <button type="button" key={customer.id} aria-pressed={customerId === customer.id} onClick={() => applyCustomer(customer)}>{customer.name}{customer.place ? ` · ${customer.place}` : ''}</button>)}</div>}
      <div className="inventory-picker">
        <Input label="Song title" value={form.trackName} minLength={2} required placeholder="Type once to search inventory or request a new song" onChange={event => { setSelectedTrack(null); setForm(current => ({ ...current, trackName:event.target.value, inventoryTrackId:'', serviceId:selectedTrack ? (video?.id ?? '') : current.serviceId })) }} />
        {selectedTrack ? <div className="selected-track"><span><Music2 size={20} /></span><div><strong>{selectedTrack.track_name}</strong><small>Ready-made video · {formatCurrency(selectedService?.price ?? 0)}</small></div><Badge tone="green">From inventory</Badge><button type="button" className="icon-btn" aria-label="Use as a new custom song" onClick={() => chooseService(videoCode)}><XCircle size={18} /></button></div>
          : searching ? <p className="quick-order-hint" role="status">Searching inventory…</p>
          : searchError ? <p className="quick-order-hint" role="status">Inventory search is unavailable. You can still request a new song.</p>
          : matches.length > 0 ? <div className="inventory-results">{matches.map(track => <button type="button" key={track.id} onClick={() => chooseTrack(track)}><span><Music2 size={17} /></span><div><strong>{track.track_name}</strong><small>{track.english_title || track.malayalam_title} · {track.language}</small></div><b>Use ready-made</b></button>)}</div>
          : form.trackName.trim().length >= 2 && <p className="quick-order-hint">No text matches. Continue with a new song, or try another spelling.</p>}
      </div>
      {!selectedTrack && <><fieldset className="quick-service-picker"><legend>What does the customer need?</legend><div>{audio && <button type="button" className={cn('quick-service', selectedService?.code === 'AU150' && 'selected')} aria-pressed={selectedService?.code === 'AU150'} onClick={() => chooseService('AU150')}><strong>Audio karaoke</strong><span>{formatCurrency(audio.price)}</span></button>}{video && <button type="button" className={cn('quick-service', selectedService?.code === videoCode && 'selected')} aria-pressed={selectedService?.code === videoCode} onClick={() => chooseService(videoCode)}><strong>Custom video</strong><span>{formatCurrency(video.price)}</span></button>}</div></fieldset>
        <Select label="Song language" value={form.language} onChange={event => { const language=event.target.value; const code=language === 'Malayalam' ? 'ML350' : 'OL450'; setForm(current => ({ ...current, language, serviceId:selectedService?.code === 'AU150' ? current.serviceId : snapshot.services.find(s => s.active && s.code === code)?.id ?? '' })) }}>{languages.map(language => <option key={language}>{language}</option>)}</Select></>}
      <Input label="Custom price (optional)" type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" value={form.customPrice??''} onChange={event=>update('customPrice',event.target.value)} placeholder={String(selectedService?.price??'')} hint={`Leave blank to use the service price (${formatCurrency(selectedService?.price??0)}). Applies only to this order.`}/>
      <details className="quick-order-extras" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>Optional details <span>Place, age, due date & notes</span></summary><div className="form-stack">
        <div className="form-grid two"><Input label="Place (optional)" autoComplete="address-level2" maxLength={120} value={form.place ?? ''} placeholder="Town or city" onChange={event => update('place',event.target.value)} /><Input label="Age (optional)" type="number" min={0} max={120} step={1} value={form.age ?? ''} placeholder="Years" onChange={event => update('age',event.target.value)} /></div>
        <div className="form-grid two"><Input label="Due date (optional)" type="date" value={form.dueDate ?? ''} onChange={event => update('dueDate',event.target.value)} /><Input label="WhatsApp (optional)" type="tel" value={form.whatsapp ?? ''} placeholder="Same as phone" onChange={event => update('whatsapp',event.target.value)} /></div>
        <Select label="Assign to" value={form.assignedTo ?? ''} onChange={event => update('assignedTo',event.target.value)}><option value="">Assign to me</option>{snapshot.profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
        <Select label="How did this enquiry reach us?" value={form.acquisitionSource??'unknown'} onChange={event=>update('acquisitionSource',event.target.value)}>{Object.entries(acquisitionChannels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select>
        <Textarea label="Order notes (optional)" value={form.notes ?? ''} rows={2} placeholder="Key, timing, or customer requests" onChange={event => update('notes',event.target.value)} />
      </div></details>
    </form>
  </Modal>
}

