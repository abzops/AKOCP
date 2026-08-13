import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { get, set } from 'idb-keyval'
import { getDashboardMetrics } from '../lib/analytics'
import { supabaseDataService } from '../lib/supabase-service'
import { supabase } from '../lib/supabase'
import type { AppSnapshot, DashboardMetrics, DataService, RefreshDomain, ToastMessage } from '../types'
import { useAuth } from './AuthContext'

interface AppDataContextValue {
  snapshot: AppSnapshot | null
  metrics: DashboardMetrics | null
  service: DataService
  loading: boolean
  refreshing: boolean
  offline: boolean
  error: string | null
  busyAction: string | null
  realtimeStatus: 'connecting' | 'live' | 'reconnecting'
  toasts: ToastMessage[]
  refresh(domains?: RefreshDomain[]): Promise<void>
  execute<T>(actionName: string, successMessage: string, action: () => Promise<T>, domains?: RefreshDomain[]): Promise<T | undefined>
  dismissToast(id: string): void
  showToast(toast: Omit<ToastMessage, 'id'>): void
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const refreshTimer = useRef<number | null>(null)
  const snapshotRef = useRef<AppSnapshot | null>(null)
  const pendingDomains = useRef(new Set<RefreshDomain>())
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const service = supabaseDataService
  const cacheKey = profile ? `akocp-snapshot-${profile.id}` : 'akocp-snapshot-anonymous'

  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { ...toast, id }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5000)
  }, [])

  useEffect(() => { snapshotRef.current = snapshot }, [snapshot])

  const refresh = useCallback(async (domains: RefreshDomain[] = []) => {
    if (!profile) return
    if (refreshInFlight.current) {
      domains.forEach((domain) => pendingDomains.current.add(domain))
      await refreshInFlight.current
      return
    }
    setRefreshing(true)
    const run = async () => {
      let requested = domains
      try {
        do {
          const current = snapshotRef.current
          const next = current && requested.length
            ? await service.loadDomains(current, profile.id, [...new Set(requested)])
            : await service.loadSnapshot(profile.id)
          snapshotRef.current = next
          setSnapshot(next)
          setError(null)
          await set(cacheKey, next)
          requested = [...pendingDomains.current]
          pendingDomains.current.clear()
        } while (requested.length)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Could not load workspace data.'
        const cached = await get<AppSnapshot>(cacheKey)
        if (cached) {
          const compatible = cached.inventorySummary ? cached : {
            ...cached,
            inventorySummary: { totalAssets: 0, totalRevenue: 0, reusedAssets: 0, topTrack: null, languages: [] }
          }
          snapshotRef.current = compatible
          setSnapshot(compatible)
          setOffline(true)
          setError(`Showing the last saved snapshot. ${message}`)
        } else {
          setError(message)
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }
    refreshInFlight.current = run()
    await refreshInFlight.current
    refreshInFlight.current = null
  }, [cacheKey, profile, service])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const online = () => {
      setOffline(false)
      void refresh()
    }
    const offlineHandler = () => setOffline(true)
    window.addEventListener('online', online)
    window.addEventListener('offline', offlineHandler)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offlineHandler)
    }
  }, [refresh])

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible' && snapshotRef.current && Date.now() - new Date(snapshotRef.current.syncedAt).getTime() > 30_000) {
        void refresh(['customers', 'orders', 'payments', 'inventory', 'finance', 'notifications', 'recordedSales'])
      }
    }
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [refresh])

  useEffect(() => {
    if (!profile) return
    const tableDomains: Record<string, RefreshDomain[]> = {
      orders: ['orders', 'customers', 'inventory', 'notifications'],
      payments: ['payments', 'orders', 'customers', 'inventory', 'finance', 'notifications'],
      withdrawals: ['finance', 'notifications'],
      notifications: ['notifications'],
      customers: ['customers', 'orders'],
      inventory_tracks: ['inventory'],
      services: ['services', 'orders'],
      profiles: ['profiles', 'orders'],
      expenses: ['finance'],
      wallet_transactions: ['finance'],
      recorded_sales: ['recordedSales', 'finance'],
      monthly_revenue_targets: ['targets']
    }
    const scheduleRefresh = (table: string) => {
      tableDomains[table].forEach((domain) => pendingDomains.current.add(domain))
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        const domains = [...pendingDomains.current]
        pendingDomains.current.clear()
        void refresh(domains)
      }, 350)
    }
    const channel = supabase
      .channel(`akocp-live-${profile.id}`)
    Object.keys(tableDomains).forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => scheduleRefresh(table))
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setRealtimeStatus('live')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRealtimeStatus('reconnecting')
      }
    })
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [profile, refresh])

  const execute = useCallback(async <T,>(actionName: string, successMessage: string, action: () => Promise<T>, domains?: RefreshDomain[]) => {
    if (offline) {
      showToast({ type: 'error', title: 'You are offline', message: 'Reconnect before changing business data.' })
      return undefined
    }
    setBusyAction(actionName)
    try {
      const result = await action()
      const inferred = domains ?? (
        actionName.includes('track') ? ['inventory'] :
        actionName.includes('customer') ? ['customers', 'orders'] :
        actionName.includes('target') ? ['targets'] :
        actionName.includes('withdrawal') || actionName.includes('expense') ? ['finance', 'notifications', 'profiles'] :
        actionName.includes('notification') ? ['notifications'] :
        ['orders', 'customers', 'payments', 'inventory', 'finance', 'notifications']
      ) as RefreshDomain[]
      await refresh(inferred)
      showToast({ type: 'success', title: successMessage })
      return result
    } catch (actionError) {
      showToast({ type: 'error', title: 'Action failed', message: actionError instanceof Error ? actionError.message : 'Please try again.' })
      return undefined
    } finally {
      setBusyAction(null)
    }
  }, [offline, refresh, showToast])

  const metrics = useMemo(() => snapshot ? getDashboardMetrics(snapshot) : null, [snapshot])
  const value = useMemo<AppDataContextValue>(() => ({
    snapshot,
    metrics,
    service,
    loading,
    refreshing,
    offline,
    error,
    busyAction,
    realtimeStatus,
    toasts,
    refresh,
    execute,
    dismissToast(id) { setToasts((current) => current.filter((toast) => toast.id !== id)) },
    showToast
  }), [busyAction, error, execute, loading, metrics, offline, realtimeStatus, refresh, refreshing, service, showToast, snapshot, toasts])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const value = useContext(AppDataContext)
  if (!value) throw new Error('useAppData must be used inside AppDataProvider')
  return value
}
