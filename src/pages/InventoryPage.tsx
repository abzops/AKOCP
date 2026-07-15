import { CircleDollarSign, Download, FileVideo, Flame, FolderOpen, Languages, Music2, Plus, Search, ShoppingCart, Sparkles, Tag } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { downloadCsv, formatCurrency, formatDate, normalizeSearch } from '../lib/format'
import type { CreateTrackInput, InventoryTrack } from '../types'

const languages = ['Malayalam', 'Tamil', 'Hindi', 'English', 'Kannada', 'Telugu', 'Other']

export function InventoryPage() {
  const { snapshot } = useAppData()
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('all')
  const [sort, setSort] = useState<'recent' | 'orders' | 'revenue' | 'name'>('orders')
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<InventoryTrack | null>(null)
  if (!snapshot) return null
  const availableLanguages = [...new Set(snapshot.tracks.map((track) => track.language))].sort()
  const filtered = snapshot.tracks.filter((track) => {
    const matchesLanguage = language === 'all' || track.language === language
    const haystack = normalizeSearch(`${track.track_name} ${track.english_title} ${track.malayalam_title} ${track.language} ${track.tags.join(' ')}`)
    return matchesLanguage && haystack.includes(normalizeSearch(query))
  }).sort((a, b) => sort === 'orders' ? b.total_orders - a.total_orders : sort === 'revenue' ? b.lifetime_revenue - a.lifetime_revenue : sort === 'name' ? a.track_name.localeCompare(b.track_name) : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const totalRevenue = snapshot.tracks.reduce((sum, track) => sum + track.lifetime_revenue, 0)
  const topTrack = [...snapshot.tracks].sort((a, b) => b.lifetime_revenue - a.lifetime_revenue)[0]
  const reused = snapshot.tracks.filter((track) => track.total_orders > 1).length
  const exportTracks = () => downloadCsv(`AKOCP-inventory-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map((track) => ({ Track: track.track_name, English: track.english_title, Malayalam: track.malayalam_title, Language: track.language, Tags: track.tags.join(', '), 'File Path': track.file_path, Orders: track.total_orders, 'Lifetime Revenue': track.lifetime_revenue, 'Last Ordered': track.last_ordered_at, Created: track.created_at })))
  return (
    <div className="page-stack inventory-page">
      <PageHeader eyebrow="Reusable digital assets" title="Karaoke inventory" description="Search Malayalam, English, Manglish, tags, and partial titles before creating anything new." action={<div className="button-row"><Button variant="secondary" icon={<Download size={16} />} onClick={exportTracks}>Export CSV</Button><Button icon={<Plus size={17} />} onClick={() => setAddOpen(true)}>Add track</Button></div>} />
      <div className="inventory-insights">
        <Card><span><Music2 size={21} /></span><div><small>Total assets</small><strong>{snapshot.tracks.length}</strong><p>Searchable karaoke tracks</p></div></Card>
        <Card><span><CircleDollarSign size={21} /></span><div><small>Asset revenue</small><strong>{formatCurrency(totalRevenue)}</strong><p>Lifetime linked sales</p></div></Card>
        <Card><span><Sparkles size={21} /></span><div><small>Reused assets</small><strong>{reused}</strong><p>Tracks sold more than once</p></div></Card>
        <Card className="top-asset"><span><Flame size={21} /></span><div><small>Highest earner</small><strong>{topTrack?.track_name ?? '—'}</strong><p>{topTrack ? formatCurrency(topTrack.lifetime_revenue) : 'No revenue yet'}</p></div></Card>
      </div>
      <Card className="inventory-browser">
        <div className="inventory-toolbar"><div className="hero-search"><Search size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Pavizha, പവിഴ, pavizha mazha…" /><kbd>⌘ K</kbd></div><Select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{availableLanguages.map((item) => <option key={item}>{item}</option>)}</Select><Select aria-label="Sort inventory" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="orders">Most ordered</option><option value="revenue">Highest revenue</option><option value="recent">Recently added</option><option value="name">A–Z</option></Select></div>
        <div className="inventory-result-meta"><span>{filtered.length} matching assets</span><small>Fuzzy partial search is active</small></div>
        {filtered.length ? <div className="track-grid">{filtered.map((track, index) => <button key={track.id} className="track-card" onClick={() => setSelected(track)}><div className="track-cover"><div className="waveform">{Array.from({ length: 18 }, (_, item) => <i key={item} style={{ height: `${20 + ((item * 17 + index * 13) % 64)}%` }} />)}</div><span><Music2 size={24} /></span>{index < 3 && sort !== 'name' && <Badge tone="yellow">Top {index + 1}</Badge>}</div><div className="track-copy"><div><span>{track.language}</span><h3>{track.track_name}</h3><p>{track.malayalam_title || track.english_title}</p></div><div className="track-tags">{track.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="track-metrics"><span><ShoppingCart size={15} /><strong>{track.total_orders}</strong><small>Orders</small></span><span><CircleDollarSign size={15} /><strong>{formatCurrency(track.lifetime_revenue)}</strong><small>Revenue</small></span></div></div></button>)}</div> : <EmptyState icon={<Music2 size={25} />} title="No matching karaoke found" description="Try another spelling or add this track as a new inventory asset." action={<Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add track</Button>} />}
      </Card>
      <AddTrackModal open={addOpen} onClose={() => setAddOpen(false)} />
      <TrackDetailsModal track={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function AddTrackModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { profile } = useAuth()
  const { snapshot, service, execute, busyAction } = useAppData()
  const [form, setForm] = useState<CreateTrackInput>({ trackName: '', englishTitle: '', malayalamTitle: '', language: 'Malayalam', tags: [], filePath: '' })
  const [tagsText, setTagsText] = useState('')
  if (!snapshot || !profile) return null
  const duplicates = form.trackName.trim().length >= 2 ? snapshot.tracks.filter((track) => normalizeSearch(`${track.track_name} ${track.english_title} ${track.malayalam_title}`).includes(normalizeSearch(form.trackName))).slice(0, 4) : []
  const update = (key: keyof CreateTrackInput, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const close = () => { setForm({ trackName: '', englishTitle: '', malayalamTitle: '', language: 'Malayalam', tags: [], filePath: '' }); setTagsText(''); onClose() }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await execute('create-track', 'Track added to inventory', () => service.createTrack({ ...form, tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean) }, profile))
    close()
  }
  return (
    <Modal open={open} onClose={close} title="Add karaoke asset" description="Create a searchable inventory record for an existing digital track." size="lg" footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="add-track-form" type="submit" loading={busyAction === 'create-track'}>Add to inventory</Button></>}>
      <form id="add-track-form" onSubmit={submit} className="form-stack"><div className="form-grid two"><Input label="Track name" value={form.trackName} onChange={(event) => update('trackName', event.target.value)} placeholder="Primary display title" required /><Select label="Language" value={form.language} onChange={(event) => update('language', event.target.value)} required>{languages.map((item) => <option key={item}>{item}</option>)}</Select></div>{duplicates.length > 0 && <div className="duplicate-warning"><strong>Possible duplicate{duplicates.length > 1 ? 's' : ''}</strong>{duplicates.map((track) => <button type="button" key={track.id}>{track.track_name}<span>{track.malayalam_title || track.english_title} · {track.language}</span></button>)}</div>}<div className="form-grid two"><Input label="English / Manglish title" value={form.englishTitle} onChange={(event) => update('englishTitle', event.target.value)} placeholder="Alternate searchable title" /><Input label="Malayalam title" value={form.malayalamTitle} onChange={(event) => update('malayalamTitle', event.target.value)} placeholder="മലയാളം ശീർഷകം" /></div><Input label="Tags" value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="movie, singer, alternate spelling" hint="Separate tags with commas." /><Input label="File path" value={form.filePath} onChange={(event) => update('filePath', event.target.value)} placeholder="Drive folder, Supabase path or share link" /><div className="form-notice"><Sparkles size={16} /> New tracks can also be added automatically when a paid order is completed.</div></form>
    </Modal>
  )
}

function TrackDetailsModal({ track, onClose }: { track: InventoryTrack | null; onClose(): void }) {
  const { snapshot } = useAppData()
  const orders = useMemo(() => snapshot?.orders.filter((order) => order.inventory_track_id === track?.id) ?? [], [snapshot?.orders, track?.id])
  if (!track) return null
  return (
    <Modal open={Boolean(track)} onClose={onClose} title={track.track_name} description={`${track.language} karaoke asset`} size="lg">
      <div className="track-detail-hero"><div className="track-detail-art"><Music2 size={31} /><div className="waveform">{Array.from({ length: 22 }, (_, item) => <i key={item} style={{ height: `${25 + ((item * 23) % 60)}%` }} />)}</div></div><div><Badge tone="yellow">{track.language}</Badge><h3>{track.malayalam_title || track.english_title}</h3><p>Created {formatDate(track.created_at)} · Last ordered {formatDate(track.last_ordered_at)}</p></div></div>
      <div className="asset-stats"><div><ShoppingCart size={18} /><span><small>Total orders</small><strong>{track.total_orders}</strong></span></div><div><CircleDollarSign size={18} /><span><small>Lifetime revenue</small><strong>{formatCurrency(track.lifetime_revenue)}</strong></span></div><div><Languages size={18} /><span><small>Search aliases</small><strong>{track.tags.length + 2}</strong></span></div></div>
      <div className="asset-meta"><div><Tag size={17} /><span>{track.tags.length ? track.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>) : 'No tags'}</span></div><div><FolderOpen size={17} /><span>{track.file_path || 'No file path recorded'}</span></div><div><FileVideo size={17} /><span>{track.created_from_order_id ? `Created from order record` : 'Imported inventory asset'}</span></div></div>
      <div className="modal-section-heading"><h3>Revenue history</h3><Badge>{orders.length} linked sales</Badge></div>
      {orders.length ? <div className="history-list">{orders.map((order) => <div key={order.id}><span className="service-code">{order.service?.code}</span><div><strong>{order.customer?.name}</strong><small>{order.order_number} · {formatDate(order.created_at)}</small></div><b>{formatCurrency(order.price)}</b></div>)}</div> : <EmptyState title="No linked sales yet" description="Future orders will appear here when this asset is selected." />}
    </Modal>
  )
}
