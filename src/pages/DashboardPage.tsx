import { Activity, ArrowRight, Banknote, CheckCircle2, CircleDollarSign, Clock3, Megaphone, Music2, ShoppingBag, TrendingUp, UsersRound, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState, MoneyStat, PageHeader, StatCard, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { getExpenseBreakdown, getMonthlyRevenue, getServiceRevenue } from '../lib/analytics'
import { expenseCategoryLabels, formatCurrency, formatDate, fromNow, statusLabels, withdrawalReasonLabels } from '../lib/format'

const chartColors = ['#f4c400', '#f59e0b', '#f97316', '#fb7185', '#a78bfa', '#38bdf8']

export function DashboardPage() {
  const { profile } = useAuth()
  const { snapshot, metrics } = useAppData()
  const navigate = useNavigate()
  if (!snapshot || !metrics) return null
  const monthlyRevenue = getMonthlyRevenue(snapshot)
  const serviceRevenue = getServiceRevenue(snapshot)
  const expenses = getExpenseBreakdown(snapshot).map((item) => ({ ...item, name: expenseCategoryLabels[item.name as keyof typeof expenseCategoryLabels] ?? item.name }))
  const latestOrders = snapshot.orders.slice(0, 6)
  const pendingWithdrawals = snapshot.withdrawals.filter((withdrawal) => withdrawal.status === 'pending').slice(0, 4)
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="page-stack dashboard-page">
      <PageHeader
        eyebrow="Business pulse"
        title={`${greeting}, ${profile?.full_name?.split(' ')[0] ?? 'Abhinand'}.`}
        description="Here is what is moving across Abhinand Karaokes today."
        action={profile?.role === 'founder' ? <button className="text-action" onClick={() => navigate('/analytics')}>Full analytics <ArrowRight size={16} /></button> : undefined}
      />

      <div className="stats-grid primary-stats">
        <MoneyStat label="Wallet balance" value={metrics.walletBalance} icon={<WalletCards size={21} />} tone="accent" trend="Available after expenses & withdrawals" />
        <MoneyStat label="Revenue today" value={metrics.revenueToday} icon={<CircleDollarSign size={21} />} tone="positive" trend={`${formatCurrency(metrics.revenueWeek)} this week`} />
        <MoneyStat label="Net profit" value={metrics.netProfit} icon={<TrendingUp size={21} />} trend={`${formatCurrency(metrics.totalExpenses)} total expenses`} />
        <StatCard label="Active orders" value={metrics.activeOrders} icon={<Activity size={21} />} trend={`${metrics.pendingOrders} need attention`} />
        <StatCard label="Completed today" value={metrics.completedToday} icon={<CheckCircle2 size={21} />} tone="positive" trend={`${metrics.completedOrders} all time`} />
        <StatCard label="New customers" value={metrics.newCustomers} icon={<UsersRound size={21} />} trend={`${metrics.totalCustomers} total customers`} />
      </div>

      <div className="dashboard-grid dashboard-charts">
        <Card className="chart-card chart-wide">
          <div className="card-heading"><div><span>Revenue trend</span><h2>Monthly revenue</h2></div><strong>{formatCurrency(metrics.revenueMonth)}<small>This month</small></strong></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyRevenue} margin={{ left: -16, right: 8, top: 12 }}>
                <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f4c400" stopOpacity={0.4} /><stop offset="100%" stopColor="#f4c400" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(value) => `₹${Number(value) / 1000}k`} />
                <Tooltip contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(value) => [formatCurrency(Number(value)), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#f4c400" strokeWidth={3} fill="url(#revenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="chart-card">
          <div className="card-heading"><div><span>Sales mix</span><h2>Revenue by service</h2></div></div>
          <div className="chart-wrap compact">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceRevenue} margin={{ left: -24, right: 4, top: 12 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(value) => [formatCurrency(Number(value)), 'Revenue']} />
                <Bar dataKey="revenue" fill="#f4c400" radius={[6, 6, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="quick-metrics">
        <div><Music2 size={18} /><span><strong>{metrics.totalInventory}</strong>Inventory tracks</span></div>
        <div><Clock3 size={18} /><span><strong>{metrics.pendingWithdrawals}</strong>Withdrawal requests</span></div>
        <div><Megaphone size={18} /><span><strong>{formatCurrency(metrics.adSpend)}</strong>Meta Ads spend</span></div>
        <div><Banknote size={18} /><span><strong>{formatCurrency(metrics.totalRevenue)}</strong>Lifetime revenue</span></div>
      </div>

      <div className="dashboard-grid operational-grid">
        <Card className="table-card latest-orders-card">
          <div className="card-heading"><div><span>Operations</span><h2>Latest orders</h2></div><button onClick={() => navigate('/orders')}>View all <ArrowRight size={15} /></button></div>
          {latestOrders.length ? <div className="responsive-table"><table><thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Status</th><th className="align-right">Value</th></tr></thead><tbody>{latestOrders.map((order) => <tr key={order.id} onClick={() => navigate('/orders')}><td><strong>{order.order_number}</strong><small>{order.track_name}</small></td><td>{order.customer?.name}<small>{order.customer?.phone}</small></td><td><span className="service-code">{order.service?.code}</span></td><td><StatusBadge status={order.status} /></td><td className="align-right"><strong>{formatCurrency(order.price)}</strong><small>{fromNow(order.created_at)}</small></td></tr>)}</tbody></table></div> : <EmptyState title="No orders yet" description="Create the first order to start the operations timeline." />}
        </Card>
        <div className="side-stack">
          <Card className="withdrawal-card">
            <div className="card-heading"><div><span>Approvals</span><h2>Withdrawal requests</h2></div><button onClick={() => navigate('/finance')}>Review</button></div>
            {pendingWithdrawals.length ? <div className="compact-list">{pendingWithdrawals.map((withdrawal) => <button key={withdrawal.id} onClick={() => navigate('/finance')}><span className="list-avatar">{withdrawal.requester?.full_name?.[0] ?? 'R'}</span><div><strong>{withdrawal.requester?.full_name}</strong><small>{withdrawalReasonLabels[withdrawal.reason]} · {fromNow(withdrawal.created_at)}</small></div><b>{formatCurrency(withdrawal.amount)}</b></button>)}</div> : <div className="mini-empty"><CheckCircle2 size={20} /><span>No approvals waiting</span></div>}
          </Card>
          <Card className="expense-card">
            <div className="card-heading"><div><span>Cost control</span><h2>Expense breakdown</h2></div><button onClick={() => navigate('/finance')}>Open finance</button></div>
            <div className="donut-layout">
              <div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={expenses} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={3}>{expenses.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(value) => formatCurrency(Number(value))} /></PieChart></ResponsiveContainer><span><strong>{formatCurrency(metrics.totalExpenses)}</strong><small>Total</small></span></div>
              <div className="chart-legend">{expenses.slice(0, 4).map((item, index) => <div key={item.name}><i style={{ background: chartColors[index] }} /><span>{item.name}</span><strong>{formatCurrency(item.value)}</strong></div>)}</div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="recent-expenses-strip">
        <div className="card-heading"><div><span>Latest activity</span><h2>Recent expenses</h2></div></div>
        <div className="expense-strip">{snapshot.expenses.slice(0, 4).map((expense) => <div key={expense.id}><span><ShoppingBag size={17} /></span><div><strong>{expense.description}</strong><small>{expenseCategoryLabels[expense.category]} · {formatDate(expense.expense_date)}</small></div><b>{formatCurrency(expense.amount)}</b></div>)}</div>
      </Card>
    </div>
  )
}
