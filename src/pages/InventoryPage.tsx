import { CircleDollarSign, Download, FileVideo, Flame, FolderOpen, Languages, Music2, Plus, Search, ShoppingCart, Sparkles, Tag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { downloadCsv, formatCurrency, formatDate } from '../lib/format'
import type { CreateTrackInput, InventoryQuery, InventorySort, InventoryTrack, Order } from '../types'

const languages = ['Malayalam', 'Tamil', 'Hindi', 'English', 'Kannada', 'Telugu', 'Other']
const PAGE_SIZE = 25

export function InventoryPage() {
  const { snapshot, service } = useAppData()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [language, setLanguage] = useState('all')
  const [sort, setSort] = useState<InventorySort>('orders')
  const [items, setItems] = useState<InventoryTrack[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<InventoryTrack | null>(null)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const queryInput = useMemo<InventoryQuery>(() => ({
    query: debouncedQuery,
    language,
    sort,
    limit: PAGE_SIZE
  }), [debouncedQuery, language, sort])

  const loadFirstPage = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setLoadError(null)
    try {
      const result = await service.searchInventory(queryInput)
      if (id !== requestId.current) return
      setItems(result.items)
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (error) {
      if (id === requestId.current) setLoadError(error instanceof Error ? error.message : 'Could not load inventory.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [queryInput, service])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loading || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await service.searchInventory({ ...queryInput, cursor })
      setItems((current) => {
        const known = new Set(current.map((track) => track.id))
        return [...current, ...result.items.filter((track) => !known.has(track.id))]
      })
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load more inventory.')
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, hasMore, loading, loadingMore, queryInput, service])

  useEffect(() => {
    const node = sentinel.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '500px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore])

  if (!snapshot) return null
  const summary = snapshot.inventorySummary

  const exportTracks = async () => {
    const all: InventoryTrack[] = []
    let nextCursor: string | null = null
    do {
      const page = await service.searchInventory({ ...queryInput, cursor: nextCursor, limit: PAGE_SIZE })
      all.push(...page.items)
      nextCursor = page.nextCursor
    } while (nextCursor)
    downloadCsv(`AKOCP-inventory-${new Date().toISOString().slice(0, 10)}.csv`, all.map((track) => ({
      Track: track.track_name,
      English: track.english_title,
      Malayalam: track.malayalam_title,
      Language: track.language,
      Tags: track.tags.join(', '),
      'File Path': track.file_path,
      Orders: track.total_orders,
      'Lifetime Revenue': track.lifetime_revenue,
      'Last Ordered': track.last_ordered_at,
      Created: track.created_at
    })))
  }

  return (
    <div className="page-stack inventory-page">
      <PageHeader eyebrow="Reusable digital assets" title="Karaoke inventory" description="Search Malayalam, English, Manglish, tags, and partial titles before creating anything new." action={<div className="button-row"><Button variant="secondary" icon={<Download size={16} />} onClick={() => void exportTracks()}>Export CSV</Button><Button icon={<Plus size={17} />} onClick={() => setAddOpen(true)}>Add track</Button></div>} />
      <div className="inventory-insights">
        <Card><span><Music2 size={21} /></span><div><small>Total assets</small><strong>{summary.totalAssets}</strong><p>Searchable karaoke tracks</p></div></Card>
        <Card><span><CircleDollarSign size={21} /></span><div><small>Asset revenue</small><strong>{formatCurrency(summary.totalRevenue)}</strong><p>Lifetime linked sales</p></div></Card>
        <Card><span><Sparkles size={21} /></span><div><small>Reused assets</small><strong>{summary.reusedAssets}</strong><p>Tracks sold more than once</p></div></Card>
        <Card className="top-asset"><span><Flame size={21} /></span><div><small>Highest earner</small><strong>{summary.topTrack?.track_name ?? '—'}</strong><p>{summary.topTrack ? formatCurrency(summary.topTrack.lifetime_revenue) : 'No revenue yet'}</p></div></Card>
      </div>
      <Card className="inventory-browser">
        <div className="inventory-toolbar"><div className="hero-search"><Search size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Pavizha, പവിഴ, pavizha mazha…" /><kbd>⌘ K</kbd></div><Select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{summary.languages.map((item) => <option key={item}>{item}</option>)}</Select><Select aria-label="Sort inventory" value={sort} onChange={(event) => setSort(event.target.value as InventorySort)}><option value="orders">Most ordered</option><option value="revenue">Highest revenue</option><option value="recent">Recently added</option><option value="name">A–Z</option></Select></div>
        <div className="inventory-result-meta"><span>{items.length}{hasMore ? '+' : ''} matching assets loaded</span><small>Fast server search · 50 at a time</small></div>
        {loading ? <div className="track-grid inventory-skeletons">{Array.from({ length: 8 }, (_, index) => <div className="track-card skeleton" key={index} />)}</div>
          : loadError && !items.length ? <EmptyState icon={<Music2 size={25} />} title="Inventory could not load" description={loadError} action={<Button onClick={() => void loadFirstPage()}>Try again</Button>} />
            : items.length ? <><div className="track-grid">{items.map((track, index) => <button key={track.id} className="track-card" onClick={() => setSelected(track)}><div className="track-cover"><span><Music2 size={24} /></span>{index < 3 && sort !== 'name' && <Badge tone="yellow">Top {index + 1}</Badge>}</div><div className="track-copy"><div><span>{track.language}</span><h3>{track.track_name}</h3><p>{track.malayalam_title || track.english_title}</p></div><div className="track-tags">{track.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="track-metrics"><span><ShoppingCart size={15} /><strong>{track.total_orders}</strong><small>Orders</small></span><span><CircleDollarSign size={15} /><strong>{formatCurrency(track.lifetime_revenue)}</strong><small>Revenue</small></span></div></div></button>)}</div><div ref={sentinel} className="inventory-load-more">{loadingMore ? <><span /><p>Loading more tracks…</p></> : hasMore ? <Button variant="secondary" onClick={() => void loadMore()}>Load more</Button> : <small>All matching tracks loaded</small>}</div></>
              : <EmptyState icon={<Music2 size={25} />} title="No matching karaoke found" description="Try another spelling or add this track as a new inventory asset." action={<Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add track</Button>} />}
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
  const [duplicates, setDuplicates] = useState<InventoryTrack[]>([])

  useEffect(() => {
    if (!open || form.trackName.trim().length < 2) {
      setDuplicates([])
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      service.searchInventory({ query: form.trackName, sort: 'name', limit: 4 }).then((result) => {
        if (active) setDuplicates(result.items)
      }).catch(() => {
        if (active) setDuplicates([])
      })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [form.trackName, open, service])

  if (!snapshot || !profile) return null
  const update = (key: keyof CreateTrackInput, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const close = () => { setForm({ trackName: '', englishTitle: '', malayalamTitle: '', language: 'Malayalam', tags: [], filePath: '' }); setTagsText(''); setDuplicates([]); onClose() }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await execute('create-track', 'Track added to inventory', () => service.createTrack({ ...form, tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean) }, profile), ['inventory'])
    close()
  }
  return (
    <Modal open={open} onClose={close} title="Add karaoke asset" description="Create a searchable inventory record for an existing digital track." size="lg" footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="add-track-form" type="submit" loading={busyAction === 'create-track'}>Add to inventory</Button></>}>
      <form id="add-track-form" onSubmit={submit} className="form-stack"><div className="form-grid two"><Input label="Track name" value={form.trackName} onChange={(event) => update('trackName', event.target.value)} placeholder="Primary display title" required /><Select label="Language" value={form.language} onChange={(event) => update('language', event.target.value)} required>{languages.map((item) => <option key={item}>{item}</option>)}</Select></div>{duplicates.length > 0 && <div className="duplicate-warning"><strong>Possible duplicate{duplicates.length > 1 ? 's' : ''}</strong>{duplicates.map((track) => <button type="button" key={track.id}>{track.track_name}<span>{track.malayalam_title || track.english_title} · {track.language}</span></button>)}</div>}<div className="form-grid two"><Input label="English / Manglish title" value={form.englishTitle} onChange={(event) => update('englishTitle', event.target.value)} placeholder="Alternate searchable title" /><Input label="Malayalam title" value={form.malayalamTitle} onChange={(event) => update('malayalamTitle', event.target.value)} placeholder="മലയാളം ശീർഷകം" /></div><Input label="Tags" value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="movie, singer, alternate spelling" hint="Separate tags with commas." /><Input label="File path" value={form.filePath} onChange={(event) => update('filePath', event.target.value)} placeholder="Drive folder, Supabase path or share link" /><div className="form-notice"><Sparkles size={16} /> New tracks can also be added automatically when a paid order is completed.</div></form>
    </Modal>
  )
}

function TrackDetailsModal({ track, onClose }: { track: InventoryTrack | null; onClose(): void }) {
  const { service } = useAppData()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!track) {
      setOrders([])
      return
    }
    let active = true
    setLoading(true)
    service.getInventoryTrackOrders(track.id).then((result) => {
      if (active) setOrders(result)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [service, track])

  if (!track) return null
  return (
    <Modal open={Boolean(track)} onClose={onClose} title={track.track_name} description={`${track.language} karaoke asset`} size="lg">
      <div className="track-detail-hero"><div className="track-detail-art"><Music2 size={31} /><div className="waveform">{Array.from({ length: 22 }, (_, item) => <i key={item} style={{ height: `${25 + ((item * 23) % 60)}%` }} />)}</div></div><div><Badge tone="yellow">{track.language}</Badge><h3>{track.malayalam_title || track.english_title}</h3><p>Created {formatDate(track.created_at)} · Last ordered {formatDate(track.last_ordered_at)}</p></div></div>
      <div className="asset-stats"><div><ShoppingCart size={18} /><span><small>Total orders</small><strong>{track.total_orders}</strong></span></div><div><CircleDollarSign size={18} /><span><small>Lifetime revenue</small><strong>{formatCurrency(track.lifetime_revenue)}</strong></span></div><div><Languages size={18} /><span><small>Search aliases</small><strong>{track.tags.length + 2}</strong></span></div></div>
      <div className="asset-meta"><div><Tag size={17} /><span>{track.tags.length ? track.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>) : 'No tags'}</span></div><div><FolderOpen size={17} /><span>{track.file_path || 'No file path recorded'}</span></div><div><FileVideo size={17} /><span>{track.created_from_order_id ? 'Created from order record' : 'Imported inventory asset'}</span></div></div>
      <div className="modal-section-heading"><h3>Revenue history</h3><Badge>{orders.length} linked sales</Badge></div>
      {loading ? <div className="history-list"><div className="skeleton" /></div> : orders.length ? <div className="history-list">{orders.map((order) => <div key={order.id}><span className="service-code">{order.service?.code}</span><div><strong>{order.customer?.name}</strong><small>{order.order_number} · {formatDate(order.created_at)}</small></div><b>{formatCurrency(order.price)}</b></div>)}</div> : <EmptyState title="No linked sales yet" description="Future orders will appear here when this asset is selected." />}
    </Modal>
  )
}
