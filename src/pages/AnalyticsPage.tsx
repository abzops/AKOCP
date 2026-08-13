import { BarChart3, CircleDollarSign, Crown, Download, Languages, Music2, ShoppingBag, TrendingUp, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, EmptyState, MoneyStat, PageHeader, Select, StatCard } from '../components/ui'
import { useAppData } from '../context/AppDataContext'
import { getDashboardMetrics, getExpenseBreakdown, getFinanceOutflowAnalysis, getLanguageOrders, getMonthlyRevenue, getServiceRevenue } from '../lib/analytics'
import { downloadCsv, expenseCategoryLabels, formatCurrency, formatDate, withdrawalReasonLabels } from '../lib/format'
import type { AppSnapshot, InventoryTrack } from '../types'

const colors = ['#f4c400', '#f59e0b', '#f97316', '#ec4899', '#8b5cf6', '#38bdf8', '#22c55e']

export function AnalyticsPage() {
  const { snapshot, metrics, service } = useAppData()
  const [range, setRange] = useState('all')
  const [topTracks, setTopTracks] = useState<InventoryTrack[]>([])
  useEffect(() => {
    let active = true
    service.searchInventory({ sort: 'revenue', limit: 8 }).then((result) => {
      if (active) setTopTracks(result.items)
    }).catch(() => {
      if (active) setTopTracks([])
    })
    return () => { active = false }
  }, [service, snapshot?.inventorySummary])
  const filtered = useMemo(() => snapshot ? filterSnapshot(snapshot, range) : null, [range, snapshot])
  if (!snapshot || !filtered || !metrics) return null
  const monthly = getMonthlyRevenue(filtered, range === 'all' ? 12 : 6)
  const serviceRevenue = getServiceRevenue(filtered)
  const languages = getLanguageOrders(filtered)
  const expenses = getExpenseBreakdown(filtered).map((item) => ({ ...item, name: expenseCategoryLabels[item.name as keyof typeof expenseCategoryLabels] ?? item.name }))
  const topCustomers = [...filtered.customers].sort((a, b) => b.lifetime_revenue - a.lifetime_revenue).slice(0, 6)
  const paidOrders = filtered.orders.filter((order) => order.payment_status === 'confirmed')
  const recordedSales = filtered.recordedSales.filter((sale) => sale.verified)
  const saleCount = paidOrders.length + recordedSales.length
  const periodRevenue = getDashboardMetrics(filtered).totalRevenue
  const averageOrder = saleCount ? periodRevenue / saleCount : 0
  const bestService = [...serviceRevenue].sort((a, b) => b.revenue - a.revenue)[0]
  const outflows = getFinanceOutflowAnalysis(filtered)
  const exportReport = () => downloadCsv(`AKOCP-analytics-${range}-${new Date().toISOString().slice(0, 10)}.csv`, [
    { Metric: 'Revenue', Value: periodRevenue },
    { Metric: 'Recorded sales', Value: saleCount },
    { Metric: 'Average sale value', Value: averageOrder },
    { Metric: 'Top service', Value: bestService?.label ?? '—' },
    { Metric: 'Top track', Value: topTracks[0]?.track_name ?? '—' },
    { Metric: 'Top customer', Value: topCustomers[0]?.name ?? '—' },
    { Metric: 'Approved withdrawals', Value: outflows.withdrawalTotal },
    { Metric: 'Approved expenses', Value: outflows.expenseTotal },
    ...outflows.byPerson.map((item) => ({ Metric: `Withdrawn by ${item.name}`, Value: item.total })),
    ...outflows.byPurpose.map((item) => ({ Metric: `Withdrawal purpose: ${withdrawalReasonLabels[item.purpose as keyof typeof withdrawalReasonLabels] ?? item.purpose}`, Value: item.total })),
    ...filtered.withdrawals.filter((item) => item.status === 'approved').map((item) => ({ Metric: `Withdrawal: ${item.requester?.full_name ?? 'Unknown'} · ${withdrawalReasonLabels[item.reason]}`, Value: `${item.amount} · ${item.notes || 'No notes'}` }))
  ])
  return (
    <div className="page-stack analytics-page">
      <PageHeader eyebrow="Founder intelligence" title="Business analytics" description="Understand which services, customers, languages, and reusable tracks drive the business." action={<div className="button-row"><Select aria-label="Analysis period" value={range} onChange={(event) => setRange(event.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="year">This year</option><option value="all">All time</option></Select><Button variant="secondary" icon={<Download size={16} />} onClick={exportReport}>Export summary</Button></div>} />
      <div className="stats-grid analytics-stats"><MoneyStat label="Period revenue" value={periodRevenue} icon={<CircleDollarSign size={21} />} tone="accent" /><StatCard label="Recorded sales" value={saleCount} icon={<ShoppingBag size={21} />} /><MoneyStat label="Average sale" value={averageOrder} icon={<TrendingUp size={21} />} /><StatCard label="Best service" value={bestService?.name ?? '—'} icon={<Crown size={21} />} trend={bestService ? formatCurrency(bestService.revenue) : 'No sales'} /></div>
      <div className="analytics-grid">
        <Card className="chart-card chart-span-2"><div className="card-heading"><div><span>Growth</span><h2>Revenue over time</h2></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthly} margin={{ left: -16, right: 12, top: 12 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), 'Revenue']} /><Line type="monotone" dataKey="revenue" stroke="#f4c400" strokeWidth={3} dot={{ fill: '#f4c400', stroke: 'var(--surface)', strokeWidth: 3, r: 5 }} /></LineChart></ResponsiveContainer></div></Card>
        <Card className="chart-card"><div className="card-heading"><div><span>Product mix</span><h2>Service revenue</h2></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={serviceRevenue} layout="vertical" margin={{ left: 8, right: 20 }}><CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="var(--chart-grid)" /><XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} /><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} width={48} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), 'Revenue']} /><Bar dataKey="revenue" fill="#f4c400" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card className="chart-card"><div className="card-heading"><div><span>Audience</span><h2>Orders by language</h2></div></div><div className="chart-wrap donut-large"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={languages} dataKey="value" nameKey="name" innerRadius={57} outerRadius={86} paddingAngle={3}>{languages.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend iconType="circle" formatter={(value) => <span className="chart-legend-label">{value}</span>} /></PieChart></ResponsiveContainer></div></Card>
        <Card className="chart-card"><div className="card-heading"><div><span>Cost structure</span><h2>Expense breakdown</h2></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={expenses} margin={{ left: -20, right: 8, top: 12 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 9 }} interval={0} /><YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="value" radius={[7, 7, 2, 2]}>{expenses.map((item, index) => <Cell key={item.name} fill={colors[(index + 1) % colors.length]} />)}</Bar></BarChart></ResponsiveContainer></div></Card>
      </div>
      <div className="finance-analysis-section">
        <div className="card-heading"><div><span>Money taken out</span><h2>Withdrawal & expense analysis</h2></div><Badge tone="yellow">Approved only</Badge></div>
        <div className="stats-grid analytics-stats"><MoneyStat label="Approved withdrawals" value={outflows.withdrawalTotal} icon={<UsersRound size={21} />} tone="negative" trend={`${outflows.byPerson.length} people`} /><MoneyStat label="Operating expenses" value={outflows.expenseTotal} icon={<CircleDollarSign size={21} />} tone="negative" trend={`${outflows.expenses.length} categories`} /><MoneyStat label="Pending withdrawals" value={outflows.pendingWithdrawalTotal} icon={<TrendingUp size={21} />} tone="accent" trend="Not deducted" /><MoneyStat label="Pending expenses" value={outflows.pendingExpenseTotal} icon={<ShoppingBag size={21} />} tone="accent" trend="Not deducted" /></div>
        <div className="analytics-rankings">
          <Card><div className="card-heading"><div><span>People</span><h2>Who withdrew how much</h2></div><UsersRound size={20} /></div>{outflows.byPerson.length ? <div className="ranking-list">{outflows.byPerson.map((item, index) => <div key={item.id}><span className={index < 3 ? 'rank top' : 'rank'}>{index + 1}</span><div><strong>{item.name}</strong><small>{item.count} approved withdrawal{item.count === 1 ? '' : 's'}</small></div><b>{formatCurrency(item.total)}</b></div>)}</div> : <EmptyState title="No approved withdrawals" description="Approved requests will appear here." />}</Card>
          <Card><div className="card-heading"><div><span>Purpose</span><h2>What withdrawals were for</h2></div><CircleDollarSign size={20} /></div>{outflows.byPurpose.length ? <div className="ranking-list">{outflows.byPurpose.map((item, index) => <div key={item.purpose}><span className={index < 3 ? 'rank top' : 'rank'}>{index + 1}</span><div><strong>{withdrawalReasonLabels[item.purpose as keyof typeof withdrawalReasonLabels] ?? item.purpose}</strong><small>{item.count} approved request{item.count === 1 ? '' : 's'}</small></div><b>{formatCurrency(item.total)}</b></div>)}</div> : <EmptyState title="No withdrawal purposes yet" description="Reasons are grouped after approval." />}</Card>
        </div>
        <Card className="table-card"><div className="card-heading"><div><span>Operating costs</span><h2>Expenses by purpose</h2></div></div>{outflows.expenses.length ? <div className="responsive-table"><table><thead><tr><th>Category</th><th className="align-right">Approved amount</th></tr></thead><tbody>{outflows.expenses.map((item) => <tr key={item.name}><td><strong>{expenseCategoryLabels[item.name as keyof typeof expenseCategoryLabels] ?? item.name}</strong></td><td className="align-right"><strong>{formatCurrency(item.value)}</strong></td></tr>)}</tbody></table></div> : <EmptyState title="No approved expenses" description="Approved expense categories will appear here." />}</Card>
        <Card className="table-card"><div className="card-heading"><div><span>Approved detail</span><h2>What each withdrawal was for</h2></div></div>{filtered.withdrawals.some((item) => item.status === 'approved') ? <div className="responsive-table"><table><thead><tr><th>Person</th><th>Purpose</th><th>Notes</th><th>Date</th><th className="align-right">Amount</th></tr></thead><tbody>{filtered.withdrawals.filter((item) => item.status === 'approved').map((item) => <tr key={item.id}><td><strong>{item.requester?.full_name ?? 'Unknown user'}</strong></td><td>{withdrawalReasonLabels[item.reason]}</td><td>{item.notes || 'No additional details'}</td><td>{formatDate(item.reviewed_at ?? item.created_at)}</td><td className="align-right"><strong>{formatCurrency(item.amount)}</strong></td></tr>)}</tbody></table></div> : <EmptyState title="No approved withdrawal details" description="Each approved request will show its person, purpose, notes, date, and amount." />}</Card>
      </div>
      <div className="analytics-rankings">
        <Card><div className="card-heading"><div><span>Reusable assets</span><h2>Highest revenue tracks</h2></div><Music2 size={20} /></div><div className="ranking-list">{topTracks.map((track, index) => <div key={track.id}><span className={index < 3 ? 'rank top' : 'rank'}>{index + 1}</span><div><strong>{track.track_name}</strong><small>{track.language} · {track.total_orders} orders</small></div><b>{formatCurrency(track.lifetime_revenue)}</b><i style={{ width: `${topTracks[0]?.lifetime_revenue ? track.lifetime_revenue / topTracks[0].lifetime_revenue * 100 : 0}%` }} /></div>)}</div></Card>
        <Card><div className="card-heading"><div><span>Customer value</span><h2>Top customers</h2></div><UsersRound size={20} /></div><div className="ranking-list customer-ranking">{topCustomers.map((customer, index) => <div key={customer.id}><span className={index < 3 ? 'rank top' : 'rank'}>{index + 1}</span><div><strong>{customer.name}</strong><small>{customer.total_orders} orders · {customer.phone}</small></div><b>{formatCurrency(customer.lifetime_revenue)}</b><i style={{ width: `${topCustomers[0]?.lifetime_revenue ? customer.lifetime_revenue / topCustomers[0].lifetime_revenue * 100 : 0}%` }} /></div>)}</div></Card>
      </div>
      <Card className="answer-strip"><BarChart3 size={24} /><div><span>Core asset answer</span><strong>{topTracks[0]?.track_name ?? 'No track yet'} is currently the highest-earning karaoke asset.</strong><p>{topTracks[0] ? `${topTracks[0].total_orders} linked orders have generated ${formatCurrency(topTracks[0].lifetime_revenue)} in lifetime revenue.` : 'Revenue will appear as payments are confirmed.'}</p></div><Badge tone="yellow">Live insight</Badge></Card>
    </div>
  )
}

const tooltipStyle = { background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }

function filterSnapshot(snapshot: AppSnapshot, range: string): AppSnapshot {
  if (range === 'all') return snapshot
  const now = new Date()
  const boundary = range === '30' ? new Date(now.getTime() - 30 * 86400000) : range === '90' ? new Date(now.getTime() - 90 * 86400000) : new Date(now.getFullYear(), 0, 1)
  const orders = snapshot.orders.filter((order) => new Date(order.created_at) >= boundary)
  const orderIds = new Set(orders.map((order) => order.id))
  return {
    ...snapshot,
    orders,
    recordedSales: snapshot.recordedSales.filter((sale) => new Date(`${sale.record_date}T12:00:00`) >= boundary),
    payments: snapshot.payments.filter((payment) => orderIds.has(payment.order_id) || new Date(payment.created_at) >= boundary),
    expenses: snapshot.expenses.filter((expense) => new Date(expense.expense_date) >= boundary),
    withdrawals: snapshot.withdrawals.filter((withdrawal) => new Date(withdrawal.created_at) >= boundary),
    walletTransactions: snapshot.walletTransactions.filter((transaction) => new Date(transaction.created_at) >= boundary)
  }
}
