import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download, Music2, Plus, TrendingUp, UsersRound, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, StatusBadge, cn } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { getMonthlyTargetForecast } from '../lib/analytics'
import { businessDate, dashboardData, displayDay, orderAttention, shiftDay, type BreakdownUnit, type DashboardPeriod } from '../lib/dashboard'
import { downloadCsv, formatCurrency, statusLabels } from '../lib/format'
import { DashboardTarget } from './DashboardTarget'
import { DashboardPlan } from './DashboardPlan'
import './dashboard.css'

const periodLabels:Record<DashboardPeriod,string>={day:'Day',week:'Week',month:'Month',all:'All time'}
const tooltipStyle={background:'var(--surface-elevated)',border:'1px solid var(--border)',borderRadius:12,color:'var(--text)'}

export function DashboardPage() {
  const {profile}=useAuth()
  const {snapshot,offline,refreshing}=useAppData()
  const navigate=useNavigate()
  const [period,setPeriod]=useState<DashboardPeriod>('month')
  const [anchor,setAnchor]=useState(()=>businessDate(new Date()))
  const [unit,setUnit]=useState<BreakdownUnit>('day')
  const [page,setPage]=useState(0)
  const [targetOpen,setTargetOpen]=useState(false)
  const [clock,setClock]=useState(()=>new Date())
  useEffect(()=>{const timer=window.setInterval(()=>setClock(new Date()),60000);return()=>window.clearInterval(timer)},[])
  const data=useMemo(()=>snapshot?dashboardData(snapshot,period,anchor,unit,clock):null,[snapshot,period,anchor,unit,clock])
  const forecast=useMemo(()=>snapshot?getMonthlyTargetForecast(snapshot,clock):null,[snapshot,clock])
  if(!snapshot||!data||!forecast)return null
  const {totals,previous,range}=data
  const selectPeriod=(next:DashboardPeriod)=>{setPeriod(next);setPage(0);setUnit(next==='all'?'month':'day')}
  const move=(direction:number)=>{
    const day=period==='week'?shiftDay(anchor,7*direction):period==='month'?(()=>{const d=new Date(`${anchor.slice(0,7)}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+direction);return d.toISOString().slice(0,10)})():shiftDay(anchor,direction)
    setAnchor(day>data.today?data.today:day);setPage(0)
  }
  const exportReport=()=>downloadCsv(`AKOCP-${unit}-${range.from}-${range.to}.csv`,data.breakdown.map(row=>({From:row.from,To:row.to,'Revenue received':row.revenue,'Approved expense debits':row.expenses,'Operating surplus':row.profit,Withdrawals:row.withdrawals,Adjustments:row.adjustments,'Wallet movement':row.movement,'Orders created':row.orders,'Order value':row.orderValue,'Production completed':row.completed,Delivered:row.delivered,'New customers':row.newCustomers})))
  const comparison=(value:number,old:number)=>{const change=value-old;return `${change>=0?'+':''}${formatCurrency(change)} vs previous period`}
  const breakdown=[...data.breakdown].reverse()
  const pageCount=Math.max(1,Math.ceil(breakdown.length/8))
  const currentPage=Math.min(page,pageCount-1)
  const liveDateLabel=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(snapshot.syncedAt))
  return <div className="page-stack dashboard-page business-dashboard">
    {offline&&<div className="form-alert error" role="status">{refreshing&&navigator.onLine?'Saved snapshot · checking live balances and order status.':'Offline snapshot · reconnect for current balances and order status.'} Last synced {liveDateLabel}.</div>}
    <PageHeader eyebrow="Business overview" title="Your target, in focus." description="Know your progress, follow your daily pace, and keep every order moving." action={<div className="button-row"><Button variant="secondary" icon={<Download size={16}/>} onClick={exportReport}>Export report</Button><Button icon={<Plus size={17}/>} onClick={()=>navigate('/orders?new=1')}>New order</Button></div>}/>
    <DashboardTarget snapshot={snapshot} forecast={forecast} now={clock} onEdit={()=>setTargetOpen(true)}/>
    <DashboardPlan snapshot={snapshot} now={clock}/>
    <div className="dash-report-heading"><h2>Explore your business</h2><p>Choose a period for money, orders, and customer activity.</p></div>
    <section className="dash-period-bar" aria-label="Dashboard date filters">
      <div className="dash-period-tabs" role="group" aria-label="Report period">{(Object.keys(periodLabels) as DashboardPeriod[]).map(item=><button key={item} aria-pressed={period===item} className={cn(period===item&&'active')} onClick={()=>selectPeriod(item)}>{periodLabels[item]}</button>)}</div>
      <div className="dash-date-controls">{period!=='all'&&<><button className="icon-btn" aria-label="Previous period" onClick={()=>move(-1)}><ChevronLeft size={17}/></button><label><CalendarDays size={16}/><span className="sr-only">Choose report date</span><input aria-label="Choose report date" type="date" value={anchor} max={data.today} onChange={e=>{if(e.target.value){setAnchor(e.target.value);setPage(0)}}}/></label><button className="icon-btn" aria-label="Next period" disabled={range.to>=data.today} onClick={()=>move(1)}><ChevronRight size={17}/></button><button className="dash-today" onClick={()=>{setAnchor(data.today);setPage(0)}}>Today</button></>}</div>
      <div className="dash-range-caption"><strong>{displayDay(range.from)}{range.to!==range.from?` – ${displayDay(range.to)}`:''}</strong><span>India time · {period==='all'?'Complete history':'To date when viewing the current period'}</span></div>
    </section>

    <section className="dash-money-grid" aria-label="Financial summary">
      <Card className="dash-wallet"><span><WalletCards size={19}/> Current wallet</span><strong>{formatCurrency(data.wallet)}</strong><p>Available now · all-time ledger balance</p><button onClick={()=>navigate('/finance?tab=ledger')}>View ledger <ArrowRight size={15}/></button></Card>
      <DashboardNumber label="Revenue received" value={formatCurrency(totals.revenue)} icon={<CircleDollarSign size={19}/>} note={previous?comparison(totals.revenue,previous.revenue):`${totals.receivedCount} recorded receipts`} tone="green"/>
      <DashboardNumber label="Approved expenses" value={formatCurrency(totals.expenses)} icon={<ArrowUpRight size={19}/>} note="Debited in the selected period"/>
      <DashboardNumber label="Operating surplus" value={formatCurrency(totals.profit)} icon={<TrendingUp size={19}/>} note="Revenue minus expenses · before withdrawals" tone={totals.profit>=0?'green':'red'}/>
    </section>

    <section className="dash-activity-grid" aria-label="Selected period activity">
      <DashboardNumber label="Orders created" value={String(totals.orders)} note={`${formatCurrency(totals.orderValue)} order value · not cash received`}/>
      <DashboardNumber label="Production completed" value={String(totals.completed)} note="By completion date"/>
      <DashboardNumber label="Orders delivered" value={String(totals.delivered)} note="By delivery date"/>
      <DashboardNumber label="New customers" value={String(totals.newCustomers)} note="By customer registration date" icon={<UsersRound size={17}/>}/>
    </section>

    <section className="dash-attention" aria-label="Current priorities"><div className="dash-section-title"><div><span>Live operations · independent of report dates</span><h2>What needs attention now</h2></div><Badge tone={data.overdue.length?'red':'green'}>{data.openOrders.length} open orders</Badge></div>
      <div className="dash-attention-grid"><Priority title="Overdue" count={data.overdue.length} note="Past the due date" urgent onClick={()=>navigate('/orders?view=overdue')}/><Priority title="Due today" count={data.dueToday.length} note="Keep delivery on time" onClick={()=>navigate('/orders?view=due_today')}/><Priority title="Ready to deliver" count={data.ready.length} note="Production completed" onClick={()=>navigate('/orders?status=completed')}/><Priority title="Payment proofs" count={data.proofs.length} note={profile?.role==='founder'?'Waiting for your review':'Waiting for Founder review'} onClick={()=>navigate('/orders?view=payment_review')}/><Priority title="Finance approvals" count={data.approvals.length} note={formatCurrency(data.approvals.reduce((n,a)=>n+Number(a.amount),0))+' awaiting review'} onClick={()=>navigate('/finance')}/></div>
      <div className="dash-receivable"><span>Uncollected order value <strong>{formatCurrency(data.outstandingAmount)}</strong></span><small>{data.outstanding.length} unpaid / unconfirmed orders · quoted value, excludes cancelled or refunded orders</small><button onClick={()=>navigate('/orders?view=unpaid')}>Review payments <ArrowRight size={14}/></button></div>
    </section>

    <div className="dash-report-grid">
      <Card className="dash-trend"><div className="dash-section-title"><div><span>Selected period</span><h2>Money in & money out</h2></div><label className="dash-granularity">Group by<select aria-label="Report breakdown" value={unit} onChange={e=>{setUnit(e.target.value as BreakdownUnit);setPage(0)}}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label></div>
        <div className="dash-chart-legend"><span><i/>Revenue</span><span><i/>Expenses</span></div>
        <div className="dash-trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.breakdown} margin={{left:0,right:16,top:10,bottom:0}}><defs><linearGradient id="dashboardCashFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f4c400" stopOpacity={.25}/><stop offset="100%" stopColor="#f4c400" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="label" tick={{fill:'var(--muted)',fontSize:10}} minTickGap={35} axisLine={false} tickLine={false}/><YAxis width={52} tick={{fill:'var(--muted)',fontSize:10}} tickFormatter={value=>Number(value)>=1000?`${Number(value)/1000}k`:String(value)} axisLine={false} tickLine={false}/><Tooltip contentStyle={tooltipStyle} formatter={(value,name)=>[formatCurrency(Number(value)),name==='revenue'?'Revenue':'Expenses']}/><Area type="monotone" dataKey="revenue" stroke="#f4c400" fill="url(#dashboardCashFill)" strokeWidth={2.5}/><Area type="monotone" dataKey="expenses" stroke="#fb7185" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
        <div className="dash-cash-footer"><span>Withdrawals <strong>{formatCurrency(totals.withdrawals)}</strong></span><span>Adjustments <strong>{formatCurrency(totals.adjustments)}</strong></span><span>Wallet movement <strong>{formatCurrency(totals.movement)}</strong></span></div>
      </Card>
      <Card className="dash-service"><div className="dash-section-title"><div><span>Received revenue</span><h2>Where the money came from</h2></div></div>{data.services.length?<div className="dash-service-list">{data.services.map(service=><div key={service.name}><div><strong>{service.name}</strong><b>{formatCurrency(service.value)}</b></div><div className="dash-bar"><i style={{width:`${totals.revenue>0?Math.max(0,service.value/totals.revenue*100):0}%`}}/></div><small>{totals.revenue>0?Math.round(service.value/totals.revenue*100):0}% of selected revenue</small></div>)}</div>:<EmptyState title="No receipts in this period" description="Confirmed receipts will appear here."/>}<p className="dash-footnote">Cash figures come from the ledger. Recorded sales are included once; order quotes are not counted as received revenue.</p></Card>
    </div>

    <Card className="dash-breakdown"><div className="dash-section-title"><div><span>Day, week, or month level</span><h2>Your numbers in detail</h2></div><button className="text-action" onClick={exportReport}>Export all rows <Download size={15}/></button></div><div className="responsive-table"><table><thead><tr><th>Period</th><th className="align-right">Revenue</th><th className="align-right">Expenses</th><th className="align-right">Surplus</th><th className="align-right">Withdrawals</th><th className="align-right">New orders</th><th className="align-right">Delivered</th><th className="align-right">New customers</th></tr></thead><tbody>{breakdown.slice(currentPage*8,currentPage*8+8).map(row=><tr key={row.key}><td><strong>{row.label}</strong></td><td className="align-right">{formatCurrency(row.revenue)}</td><td className="align-right">{formatCurrency(row.expenses)}</td><td className="align-right">{formatCurrency(row.profit)}</td><td className="align-right">{formatCurrency(row.withdrawals)}</td><td className="align-right">{row.orders}</td><td className="align-right">{row.delivered}</td><td className="align-right">{row.newCustomers}</td></tr>)}</tbody><tfoot><tr><td>Period total</td><td className="align-right">{formatCurrency(totals.revenue)}</td><td className="align-right">{formatCurrency(totals.expenses)}</td><td className="align-right">{formatCurrency(totals.profit)}</td><td className="align-right">{formatCurrency(totals.withdrawals)}</td><td className="align-right">{totals.orders}</td><td className="align-right">{totals.delivered}</td><td className="align-right">{totals.newCustomers}</td></tr></tfoot></table></div><div className="dash-pagination"><span>Latest first · {breakdown.length} rows</span><div><button className="icon-btn" aria-label="Previous report rows" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/></button><span>{currentPage+1} / {pageCount}</span><button className="icon-btn" aria-label="Next report rows" disabled={currentPage>=pageCount-1} onClick={()=>setPage(currentPage+1)}><ChevronRight size={16}/></button></div></div></Card>

    <div className="dash-work-grid"><Card><div className="dash-section-title"><div><span>Current work</span><h2>Delivery queue</h2></div><button className="text-action" onClick={()=>navigate('/orders')}>All orders <ArrowRight size={15}/></button></div>{data.attention.length?<div className="dash-order-list">{data.attention.slice(0,5).map(order=><button key={order.id} onClick={()=>navigate(`/orders?order=${order.id}`)}><div><strong>{order.track_name}</strong><small>{order.order_number} · {order.customer?.name??'Customer'}{order.due_date?` · Due ${displayDay(order.due_date)}`:''}</small></div><Badge tone={orderAttention(order,data.today)==='Overdue'?'red':'yellow'}>{orderAttention(order,data.today)}</Badge><ArrowRight size={15}/></button>)}</div>:<EmptyState title="No urgent deliveries" description="Overdue, due-today, and completed orders appear here."/>}<div className="dash-pipeline">{data.pipeline.map(item=><button key={item.status} onClick={()=>navigate(`/orders?status=${item.status}`)}><strong>{item.count}</strong><span>{statusLabels[item.status]}</span></button>)}</div></Card>
      <Card><div className="dash-section-title"><div><span>Selected period</span><h2>Recent money activity</h2></div><button className="text-action" onClick={()=>navigate('/finance?tab=ledger')}>Ledger <ArrowRight size={15}/></button></div>{data.recentTransactions.length?<div className="dash-ledger-list">{data.recentTransactions.map(tx=><button key={tx.id} onClick={()=>navigate('/finance?tab=ledger')}><span className={cn('dash-ledger-icon',tx.amount<0&&'debit')}>{tx.amount<0?<ArrowUpRight size={18}/>:<ArrowDownLeft size={18}/>}</span><div><strong>{tx.description}</strong><small>{displayDay(businessDate(tx.created_at))} · {tx.type.replaceAll('_',' ')}</small></div><b className={tx.amount<0?'dash-negative':'dash-positive'}>{tx.amount>=0?'+':''}{formatCurrency(tx.amount)}</b></button>)}</div>:<EmptyState title="No money activity" description="Try another period to see ledger activity."/>}<div className="dash-context"><span><Music2 size={16}/>{snapshot.inventorySummary.totalAssets.toLocaleString('en-IN')} inventory tracks</span><span><UsersRound size={16}/>{snapshot.customers.length} customer profiles</span></div></Card></div>

    <Card className="dash-breakdown"><div className="dash-section-title"><div><span>Selected period · latest six</span><h2>New order activity</h2></div><button className="text-action" onClick={()=>navigate('/orders')}>All orders <ArrowRight size={15}/></button></div>{data.latestOrders.length?<div className="responsive-table"><table><thead><tr><th>Order / song</th><th>Customer</th><th>Payment</th><th>Status</th><th className="align-right">Order value</th><th/></tr></thead><tbody>{data.latestOrders.map(order=><tr key={order.id}><td><strong>{order.order_number}</strong><small>{order.track_name}</small></td><td>{order.customer?.name??'Customer'}</td><td><StatusBadge status={order.payment_status}/></td><td><StatusBadge status={order.status}/></td><td className="align-right">{formatCurrency(order.price)}</td><td><button className="text-action" aria-label={`Open ${order.order_number}`} onClick={()=>navigate(`/orders?order=${order.id}`)}>Open <ArrowRight size={14}/></button></td></tr>)}</tbody></table></div>:<EmptyState title="No new orders in this period" description="Use a different date or create a new order."/>}</Card>

    <MonthlyTargetModal open={targetOpen} onClose={()=>setTargetOpen(false)} initialValue={forecast.target}/>
    <details className="dash-definitions"><summary>How these numbers are calculated</summary><p>All dates use Asia/Kolkata. Revenue, expenses, withdrawals, and adjustments use the date recorded in the wallet ledger. Surplus is received revenue minus approved expense debits; it is not an accounting profit statement. Orders, completions, deliveries, and customers each use their own event dates. Registration counts may include historical customers imported later. Current wallet and work queues always show the current state, regardless of the selected period. Comparisons use the previous day or the same number of calendar days in the previous week or month. Current-day receipts are compared with the full previous day. Monthly target always refers to the current month.</p><p>Last synced {liveDateLabel} · {totals.recordedSales} owner-recorded sales dated in the selection; these are not added again to cash totals.</p></details>
  </div>
}

function DashboardNumber({label,value,note,icon,tone}:{label:string;value:string;note:string;icon?:React.ReactNode;tone?:'green'|'red'}){
  return <Card className={cn('dash-number',tone&&`dash-${tone}`)}><span>{label}{icon}</span><strong>{value}</strong><p>{note}</p></Card>
}
function Priority({title,count,note,urgent,onClick}:{title:string;count:number;note:string;urgent?:boolean;onClick():void}){
  return <button className={cn('dash-priority',urgent&&count>0&&'urgent')} onClick={onClick}><span>{title}<ArrowRight size={14}/></span><strong>{count}</strong><small>{note}</small></button>
}

function MonthlyTargetModal({ open, onClose, initialValue }: { open: boolean; onClose(): void; initialValue: number }) {
  const { profile } = useAuth(); const { service, execute, busyAction } = useAppData(); const [amount, setAmount] = useState(initialValue ? String(initialValue) : '')
  useEffect(() => { if (open) setAmount(initialValue ? String(initialValue) : '') }, [initialValue, open])
  if (!profile) return null
  const submit = async (event: FormEvent) => { event.preventDefault(); const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date()); await execute('monthly-target', 'Monthly target updated', () => service.upsertMonthlyTarget(`${parts}-01`, Number(amount), profile), ['targets']); onClose() }
  return <Modal open={open} onClose={onClose} title="Set monthly revenue target" description="Confirmed revenue is measured using the Asia/Kolkata calendar month." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="monthly-target-form" type="submit" loading={busyAction === 'monthly-target'}>Save target</Button></>}><form id="monthly-target-form" onSubmit={submit} className="form-stack"><Input label="Target amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required hint="Both Founder and Operations users can update the shared monthly target." /></form></Modal>
}
