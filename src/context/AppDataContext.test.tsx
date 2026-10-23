import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppDataProvider, useAppData } from './AppDataContext'

const mocks = vi.hoisted(() => ({
  profile: { id: 'test-user' },
  load: vi.fn(), get: vi.fn(), set: vi.fn(),
}))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ profile: mocks.profile }) }))
vi.mock('idb-keyval', () => ({ get: mocks.get, set: mocks.set }))
vi.mock('../lib/analytics', () => ({ getDashboardMetrics: () => ({}) }))
vi.mock('../lib/supabase-service', () => ({ supabaseDataService: { loadSnapshot: mocks.load } }))
vi.mock('../lib/supabase', () => ({ supabase: {
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel },
  removeChannel: vi.fn(),
} }))

function Probe() {
  const { offline, loading, refresh, error } = useAppData()
  return <><span>{loading ? 'loading' : offline ? 'offline' : 'online'}</span><span>{error}</span><button onClick={() => void refresh()}>Refresh</button></>
}
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('network and cache recovery', () => {
  it('restores write access after a cached fallback and a successful refresh', async () => {
    const snapshot = { inventorySummary: {}, syncedAt: new Date().toISOString() }
    mocks.get.mockResolvedValue(snapshot)
    mocks.set.mockResolvedValue(undefined)
    mocks.load.mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValue(snapshot)
    render(<AppDataProvider><Probe /></AppDataProvider>)
    expect(await screen.findByText('offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('online')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/last saved snapshot/)).not.toBeInTheDocument())
  })
  it('keeps fresh network data usable when IndexedDB cannot save it', async () => {
    mocks.load.mockResolvedValue({ inventorySummary: {}, syncedAt: new Date().toISOString() })
    mocks.set.mockRejectedValue(new Error('Storage quota exceeded'))
    render(<AppDataProvider><Probe /></AppDataProvider>)
    expect(await screen.findByText('online')).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledWith('akocp-snapshot-test-user')
  })
  it('renders the user cache during a slow request and keeps writes locked until fresh data arrives',async()=>{
    const cached={inventorySummary:{},syncedAt:'2026-10-22T10:00:00Z'}
    mocks.get.mockResolvedValue(cached);mocks.set.mockResolvedValue(undefined)
    let resolveLoad!:(value:unknown)=>void
    mocks.load.mockImplementation(()=>new Promise(resolve=>{resolveLoad=resolve}))
    function CachedProbe(){const {snapshot,offline}=useAppData();return <span>{snapshot?offline?'saved read-only':'live writable':'no data'}</span>}
    render(<AppDataProvider><CachedProbe/></AppDataProvider>)
    expect(await screen.findByText('saved read-only')).toBeInTheDocument()
    resolveLoad({...cached,syncedAt:'2026-10-23T10:00:00Z'})
    expect(await screen.findByText('live writable')).toBeInTheDocument()
  })
  it('does not let a late cache read replace a fresh response',async()=>{
    let resolveCache!:(value:unknown)=>void
    mocks.get.mockImplementation(()=>new Promise(resolve=>{resolveCache=resolve}))
    mocks.load.mockResolvedValue({inventorySummary:{},syncedAt:'fresh'})
    mocks.set.mockResolvedValue(undefined)
    function CacheRaceProbe(){const {snapshot,offline}=useAppData();return <span>{snapshot?`${snapshot.syncedAt} ${offline?'cached':'live'}`:'waiting'}</span>}
    render(<AppDataProvider><CacheRaceProbe/></AppDataProvider>)
    expect(await screen.findByText('fresh live')).toBeInTheDocument()
    resolveCache({inventorySummary:{},syncedAt:'old'})
    await waitFor(()=>expect(screen.getByText('fresh live')).toBeInTheDocument())
  })
})
