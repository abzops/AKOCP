import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { get, set } from 'idb-keyval'
import { getDashboardMetrics } from '../lib/analytics'
import { supabaseDataService } from '../lib/supabase-service'
import { supabase } from '../lib/supabase'
import type { AppSnapshot, DashboardMetrics, DataService, ToastMessage } from '../types'
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
  toasts: ToastMessage[]
  refresh(): Promise<void>
  execute<T>(actionName: string, successMessage: string, action: () => Promise<T>): Promise<T | undefined>
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
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const refreshTimer = useRef<number | null>(null)
  const service = supabaseDataService
  const cacheKey = profile ? `akocp-snapshot-${profile.id}` : 'akocp-snapshot-anonymous'

  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { ...toast, id }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5000)
  }, [])

  const refresh = useCallback(async () => {
    if (!profile) return
    setRefreshing(true)
    try {
      const next = await service.loadSnapshot(profile.id)
      setSnapshot(next)
      setError(null)
      await set(cacheKey, next)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Could not load workspace data.'
      const cached = await get<AppSnapshot>(cacheKey)
      if (cached) {
        setSnapshot(cached)
        setOffline(true)
        setError(`Showing the last saved snapshot. ${message}`)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
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
    if (!profile) return
    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => void refresh(), 350)
    }
    const channel = supabase
      .channel(`akocp-live-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, scheduleRefresh)
      .subscribe()
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [profile, refresh])

  const execute = useCallback(async <T,>(actionName: string, successMessage: string, action: () => Promise<T>) => {
    if (offline) {
      showToast({ type: 'error', title: 'You are offline', message: 'Reconnect before changing business data.' })
      return undefined
    }
    setBusyAction(actionName)
    try {
      const result = await action()
      await refresh()
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
    toasts,
    refresh,
    execute,
    dismissToast(id) { setToasts((current) => current.filter((toast) => toast.id !== id)) },
    showToast
  }), [busyAction, error, execute, loading, metrics, offline, refresh, refreshing, service, showToast, snapshot, toasts])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const value = useContext(AppDataContext)
  if (!value) throw new Error('useAppData must be used inside AppDataProvider')
  return value
}
