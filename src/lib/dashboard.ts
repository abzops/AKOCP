import type { AppSnapshot, Order } from '../types'

export type DashboardPeriod = 'day' | 'week' | 'month' | 'all'
export type BreakdownUnit = 'day' | 'week' | 'month'
export const businessDate = (value: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(value))
const date = (key: string) => new Date(`${key}T00:00:00Z`)
export const shiftDay = (key: string, days: number) => { const d=date(key); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10) }
const monthEnd = (key: string) => new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7)),0)).toISOString().slice(0,10)
const monday = (key: string) => shiftDay(key,-((date(key).getUTCDay()+6)%7))
export const displayDay = (key: string) => date(key).toLocaleDateString('en-IN',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'})
const sum = <T,>(rows:T[],value:(row:T)=>number) => rows.reduce((total,row)=>total+Number(value(row)),0)
const revenueTypes = new Set(['payment','purged_payment','purged_recorded_sale'])

export function dashboardRange(period:DashboardPeriod,anchor:string,today:string,first:string) {
  const end=anchor>today?today:anchor
  if(period==='all')return {from:first<today?first:today,to:today,previous:null}
  const from=period==='day'?end:period==='week'?monday(end):`${end.slice(0,7)}-01`
  const naturalEnd=period==='day'?end:period==='week'?shiftDay(from,6):monthEnd(from)
  const to=naturalEnd>today?today:naturalEnd
  const elapsed=Math.round((date(to).getTime()-date(from).getTime())/86400000)
  let previousFrom=shiftDay(from,period==='week'?-7:-1)
  let previousTo=shiftDay(previousFrom,elapsed)
  if(period==='month'){
    const d=date(from); d.setUTCMonth(d.getUTCMonth()-1); previousFrom=d.toISOString().slice(0,10)
    previousTo=to===naturalEnd?monthEnd(previousFrom):[shiftDay(previousFrom,elapsed),monthEnd(previousFrom)].sort()[0]
  }
  return {from,to,previous:{from:previousFrom,to:previousTo}}
}

export function periodTotals(snapshot:AppSnapshot,from:string,to:string) {
  const inside=(value?:string|null)=>Boolean(value&&businessDate(value)>=from&&businessDate(value)<=to)
  const transactions=snapshot.walletTransactions.filter(t=>inside(t.created_at))
  const revenue=sum(transactions.filter(t=>revenueTypes.has(t.type)),t=>t.amount)
  const expenses=-sum(transactions.filter(t=>t.type==='expense'),t=>t.amount)||0
  const withdrawals=-sum(transactions.filter(t=>t.type==='withdrawal'),t=>t.amount)||0
  const adjustments=sum(transactions.filter(t=>t.type==='adjustment'),t=>t.amount)
  const orders=snapshot.orders.filter(o=>!o.deleted_at&&inside(o.created_at))
  const completed=snapshot.orders.filter(o=>!o.deleted_at&&inside(o.completed_at))
  const delivered=snapshot.orders.filter(o=>!o.deleted_at&&inside(o.delivered_at))
  return {revenue,expenses,withdrawals,adjustments,profit:revenue-expenses,movement:sum(transactions,t=>t.amount),
    orders:orders.length,orderValue:sum(orders.filter(o=>o.status!=='cancelled'),o=>o.price),
    completed:completed.length,delivered:delivered.length,
    newCustomers:snapshot.customers.filter(c=>!c.deleted_at&&inside(c.created_at)).length,
    receivedCount:transactions.filter(t=>revenueTypes.has(t.type)).length,
    recordedSales:(snapshot.recordedSales??[]).filter(s=>s.verified&&s.record_date>=from&&s.record_date<=to).length,
    transactions,orderRows:orders}
}

export function dashboardData(snapshot:AppSnapshot,period:DashboardPeriod,anchor:string,unit:BreakdownUnit,now=new Date()) {
  const today=businessDate(now)
  const dates=[today,...snapshot.walletTransactions.map(t=>businessDate(t.created_at)),...snapshot.orders.filter(o=>!o.deleted_at).flatMap(o=>[o.created_at,o.completed_at,o.delivered_at].filter((value):value is string=>Boolean(value)).map(businessDate)),...snapshot.customers.filter(c=>!c.deleted_at).map(c=>businessDate(c.created_at)),...(snapshot.recordedSales??[]).filter(s=>s.verified).map(s=>s.record_date)].sort()
  const range=dashboardRange(period,anchor,today,dates[0])
  const totals=periodTotals(snapshot,range.from,range.to)
  const previous=range.previous?periodTotals(snapshot,range.previous.from,range.previous.to):null
  const paidByOrder=new Map<string,number>()
  snapshot.payments.filter(p=>p.status==='confirmed').forEach(p=>paidByOrder.set(p.order_id,(paidByOrder.get(p.order_id)??0)+Number(p.amount)))
  const openOrders=snapshot.orders.filter(o=>!o.deleted_at&&!['delivered','cancelled'].includes(o.status))
  const overdue=openOrders.filter(o=>o.due_date&&o.due_date<today)
  const dueToday=openOrders.filter(o=>o.due_date===today)
  const outstanding=snapshot.orders.filter(o=>!o.deleted_at&&o.status!=='cancelled'&&!['confirmed','refunded'].includes(o.payment_status))
  const outstandingAmount=sum(outstanding,o=>Math.max(Number(o.price)-(paidByOrder.get(o.id)??0),0))
  const proofs=snapshot.payments.filter(p=>p.status==='pending'&&snapshot.orders.some(o=>o.id===p.order_id&&!o.deleted_at))
  const approvals=[...snapshot.expenses.filter(e=>e.status==='pending'&&!e.deleted_at),...snapshot.withdrawals.filter(w=>w.status==='pending')]
  const ready=openOrders.filter(o=>o.status==='completed')
  const statuses=['inquiry','payment_pending','in_progress','completed','delivered','cancelled'] as const
  const pipeline=statuses.map(status=>({status,count:snapshot.orders.filter(o=>!o.deleted_at&&o.status===status).length}))
  const attention=[...new Map([...overdue,...dueToday,...ready].map(o=>[o.id,o])).values()]
    .sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999'))
  const bucket=(key:string)=>unit==='month'?`${key.slice(0,7)}-01`:unit==='week'?monday(key):key
  const breakdown=[]
  for(let cursor=range.from;cursor<=range.to;){
    const key=bucket(cursor)
    const end=unit==='month'?monthEnd(key):unit==='week'?shiftDay(key,6):key
    const to=end<range.to?end:range.to
    const values=periodTotals(snapshot,cursor,to)
    breakdown.push({key,label:unit==='month'?date(key).toLocaleDateString('en-IN',{timeZone:'UTC',month:'short',year:'numeric'}):unit==='week'?`${displayDay(cursor)} – ${displayDay(to)}`:displayDay(key),from:cursor,to,...values})
    cursor=shiftDay(to,1)
  }
  const serviceByOrder=new Map(snapshot.orders.map(o=>[o.id,o.service?.code??snapshot.services.find(s=>s.id===o.service_id)?.code??'Other']))
  const paymentById=new Map(snapshot.payments.map(p=>[p.id,p]))
  const serviceValues=new Map<string,number>()
  totals.transactions.filter(t=>revenueTypes.has(t.type)).forEach(t=>{
    const payment=t.reference_type==='payment'?paymentById.get(t.reference_id):null
    const name=payment?serviceByOrder.get(payment.order_id)??'Other':t.reference_type==='recorded_sale'?'Recorded sales':'Other / anonymized'
    serviceValues.set(name,(serviceValues.get(name)??0)+Number(t.amount))
  })
  return {today,range,totals,previous,breakdown,wallet:sum(snapshot.walletTransactions,t=>t.amount),
    openOrders,overdue,dueToday,ready,outstanding,outstandingAmount,proofs,approvals,attention,pipeline,
    services:[...serviceValues].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),
    latestOrders:[...totals.orderRows].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,6),
    recentTransactions:[...totals.transactions].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,6)}
}

export function orderAttention(order:Order,today:string) {
  return order.due_date&&order.due_date<today?'Overdue':order.due_date===today?'Due today':order.status==='completed'?'Ready to deliver':'Open'
}
