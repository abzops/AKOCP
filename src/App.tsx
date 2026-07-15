import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingScreen } from './components/ui'
import { AppDataProvider, useAppData } from './context/AppDataContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AuthPage } from './pages/AuthPage'
import { SetupRequiredPage } from './pages/SetupRequiredPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((module) => ({ default: module.OrdersPage })))
const InventoryPage = lazy(() => import('./pages/InventoryPage').then((module) => ({ default: module.InventoryPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((module) => ({ default: module.CustomersPage })))
const FinancePage = lazy(() => import('./pages/FinancePage').then((module) => ({ default: module.FinancePage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

export default function App() {
  return <ErrorBoundary><AuthProvider><AuthGate /></AuthProvider></ErrorBoundary>
}

function AuthGate() {
  const { profile, loading } = useAuth()
  if (loading) return <LoadingScreen label="Securing your workspace…" />
  if (!profile) return <AuthPage />
  return <AppDataProvider><Workspace /></AppDataProvider>
}

function Workspace() {
  const { loading, snapshot, error } = useAppData()
  const { profile } = useAuth()
  if (loading && !snapshot) return <LoadingScreen />
  if (!snapshot && error) return <SetupRequiredPage message={error} />
  const page = (content: ReactNode) => <Suspense fallback={<div className="page-loading"><span /><p>Loading module…</p></div>}>{content}</Suspense>
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={page(<DashboardPage />)} />
        <Route path="orders" element={page(<OrdersPage />)} />
        <Route path="inventory" element={page(<InventoryPage />)} />
        <Route path="customers" element={page(<CustomersPage />)} />
        <Route path="finance" element={page(<FinancePage />)} />
        <Route path="analytics" element={profile?.role === 'founder' ? page(<AnalyticsPage />) : <Navigate to="/" replace />} />
        <Route path="settings" element={profile?.role === 'founder' ? page(<SettingsPage />) : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
