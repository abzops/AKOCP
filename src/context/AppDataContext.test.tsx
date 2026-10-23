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
    expect(mocks.get).not.toHaveBeenCalled()
  })
})
