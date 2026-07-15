import {
  BarChart3,
  Bell,
  ChevronRight,
  ClipboardList,
  Command,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Music2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  UsersRound,
  WalletCards,
  WifiOff,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { fromNow, initials, normalizeSearch } from '../lib/format'
import { Badge, BrandMark, Button, IconButton, Modal, ToastStack, cn } from './ui'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['founder', 'operations'] },
  { to: '/orders', label: 'Orders', icon: ClipboardList, roles: ['founder', 'operations'] },
  { to: '/inventory', label: 'Inventory', icon: Music2, roles: ['founder', 'operations'] },
  { to: '/customers', label: 'Customers', icon: UsersRound, roles: ['founder', 'operations'] },
  { to: '/finance', label: 'Finance', icon: WalletCards, roles: ['founder', 'operations'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['founder'] },
  { to: '/settings', label: 'Settings', icon: Settings2, roles: ['founder'] }
]

const pageTitles: Record<string, string> = {
  '/': 'Founder dashboard',
  '/orders': 'Order workspace',
  '/inventory': 'Karaoke inventory',
  '/customers': 'Customers',
  '/finance': 'Wallet & finance',
  '/analytics': 'Business analytics',
  '/settings': 'System settings'
}

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { snapshot, offline, refreshing, refresh, service, execute, toasts, dismissToast } = useAppData()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('akocp-theme') ?? 'dark')
  const [installEvent, setInstallEvent] = useState<any>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const visibleNav = useMemo(() => navItems.filter((item) => profile && item.roles.includes(profile.role)), [profile])
  const unread = snapshot?.notifications.filter((notification) => !notification.read_at) ?? []

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('akocp-theme', theme)
  }, [theme])

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const inputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (!inputActive && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        navigate('/orders?new=1')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  const closeSidebar = () => setSidebarOpen(false)
  const handleInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
  }
  const markAllRead = async () => {
    if (!profile || !unread.length) return
    await execute('notifications', 'Notifications marked as read', () => service.markNotificationsRead(unread.map((item) => item.id), profile))
  }

  return (
    <div className="app-shell">
      <aside className={cn('sidebar', sidebarOpen && 'sidebar-open')}>
        <div className="sidebar-brand">
          <BrandMark withName />
          <IconButton label="Close navigation" className="sidebar-close" onClick={closeSidebar}><X size={20} /></IconButton>
        </div>
        <div className="workspace-label"><span>Operations Control</span><Badge tone="green">Live</Badge></div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={closeSidebar} className={({ isActive }) => cn(isActive && 'active')}>
              <Icon size={19} />
              <span>{label}</span>
              <ChevronRight size={15} className="nav-chevron" />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {installEvent && <Button variant="secondary" icon={<Download size={16} />} onClick={handleInstall}>Install app</Button>}
          <div className="shortcut-hint"><Command size={14} /><span>Search anywhere</span><kbd>Ctrl K</kbd></div>
          <div className="sidebar-user">
            <span className="avatar">{initials(profile?.full_name ?? 'AK')}</span>
            <div><strong>{profile?.full_name}</strong><small>{profile?.role === 'founder' ? 'Founder' : 'Operations'}</small></div>
            <IconButton label="Sign out" onClick={() => void signOut()}><LogOut size={17} /></IconButton>
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={closeSidebar} />}

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton label="Open navigation" className="menu-button" onClick={() => setSidebarOpen(true)}><Menu size={21} /></IconButton>
            <div className="topbar-title"><span>{location.pathname === '/' && profile?.role === 'operations' ? 'Operations dashboard' : pageTitles[location.pathname] ?? 'AK OCP'}</span><small>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div>
          </div>
          <button className="global-search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
            <span>Search orders, tracks, customers…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            {offline && <span className="offline-pill"><WifiOff size={14} /> Offline</span>}
            <IconButton label="Refresh data" onClick={() => void refresh()} className={refreshing ? 'spin-child' : ''}><RefreshCw size={18} /></IconButton>
            <IconButton label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
            <div className="popover-wrap">
              <IconButton label="Notifications" className="notification-button" onClick={() => setNotificationsOpen(!notificationsOpen)}>
                <Bell size={19} />{unread.length > 0 && <b>{Math.min(unread.length, 9)}</b>}
              </IconButton>
              {notificationsOpen && (
                <div className="popover notifications-popover">
                  <div className="popover-header"><div><strong>Notifications</strong><span>{unread.length} unread</span></div>{unread.length > 0 && <button onClick={() => void markAllRead()}>Mark all read</button>}</div>
                  <div className="notification-list">
                    {snapshot?.notifications.length ? snapshot.notifications.slice(0, 10).map((notification) => (
                      <button key={notification.id} className={cn('notification-item', !notification.read_at && 'unread')} onClick={() => {
                        setNotificationsOpen(false)
                        if (notification.entity_type === 'order') navigate('/orders')
                        else if (notification.entity_type === 'withdrawal') navigate('/finance')
                      }}>
                        <span className="notification-dot" />
                        <div><strong>{notification.title}</strong><p>{notification.message}</p><small>{fromNow(notification.created_at)}</small></div>
                      </button>
                    )) : <div className="popover-empty">You are all caught up.</div>}
                  </div>
                </div>
              )}
            </div>
            <div className="popover-wrap user-menu-wrap">
              <button className="topbar-avatar" onClick={() => setProfileOpen(!profileOpen)}><span>{initials(profile?.full_name ?? 'AK')}</span></button>
              {profileOpen && (
                <div className="popover profile-popover">
                  <div><strong>{profile?.full_name}</strong><span>{profile?.email}</span></div>
                  <button onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {offline && <div className="offline-banner"><WifiOff size={15} /> You are viewing cached data. Changes are disabled until the connection returns.</div>}
        <main className="app-content"><Outlet /></main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {visibleNav.slice(0, 5).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20} /><span>{label}</span></NavLink>)}
        </nav>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <button className="mobile-fab" aria-label="Create order" onClick={() => navigate('/orders?new=1')}><Plus size={23} /></button>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function GlobalSearch({ open, onClose }: { open: boolean; onClose(): void }) {
  const [query, setQuery] = useState('')
  const { snapshot } = useAppData()
  const navigate = useNavigate()
  const results = useMemo(() => {
    if (!snapshot || !query.trim()) return []
    const needle = normalizeSearch(query)
    const orderResults = snapshot.orders.filter((order) => normalizeSearch(`${order.order_number} ${order.track_name} ${order.customer?.name} ${order.customer?.phone}`).includes(needle)).slice(0, 5).map((order) => ({ type: 'Order', title: `${order.order_number} · ${order.track_name}`, subtitle: order.customer?.name ?? '', to: '/orders' }))
    const trackResults = snapshot.tracks.filter((track) => normalizeSearch(`${track.track_name} ${track.english_title} ${track.malayalam_title} ${track.tags.join(' ')}`).includes(needle)).slice(0, 5).map((track) => ({ type: 'Track', title: track.track_name, subtitle: `${track.language} · ${track.total_orders} orders`, to: '/inventory' }))
    const customerResults = snapshot.customers.filter((customer) => normalizeSearch(`${customer.name} ${customer.phone} ${customer.whatsapp}`).includes(needle)).slice(0, 5).map((customer) => ({ type: 'Customer', title: customer.name, subtitle: customer.phone, to: '/customers' }))
    return [...orderResults, ...trackResults, ...customerResults].slice(0, 12)
  }, [query, snapshot])
  const close = useCallback(() => { setQuery(''); onClose() }, [onClose])
  const choose = useCallback((to: string) => { navigate(to); close() }, [close, navigate])
  return (
    <Modal open={open} onClose={close} title="Global search" description="Find orders, customers, and reusable karaoke tracks." size="lg">
      <div className="command-search"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name, phone, order ID, Malayalam or Manglish title…" /></div>
      <div className="command-results">
        {!query.trim() ? <div className="command-empty"><Search size={25} /><p>Search across the entire command center.</p><span>Tip: press <kbd>N</kbd> anywhere to create a new order.</span></div>
          : results.length ? results.map((result, index) => <button key={`${result.type}-${result.title}-${index}`} onClick={() => choose(result.to)}><Badge tone={result.type === 'Order' ? 'yellow' : result.type === 'Track' ? 'purple' : 'blue'}>{result.type}</Badge><div><strong>{result.title}</strong><span>{result.subtitle}</span></div><ChevronRight size={17} /></button>)
            : <div className="command-empty"><Search size={25} /><p>No matching records.</p><span>Try a shorter title or phone number.</span></div>}
      </div>
    </Modal>
  )
}
