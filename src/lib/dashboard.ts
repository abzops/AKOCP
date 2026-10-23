import type { AppSnapshot, Order } from '../types'

export type DashboardPeriod = 'day' | 'week' | 'month' | 'all'
export type BreakdownUnit = 'day' | 'week' | 'month'
const businessDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit' })
const displayDayFormatter = new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'})
const displayMonthFormatter = new Intl.DateTimeFormat('en-IN',{timeZone:'UTC',month:'short',year:'numeric'})
export const businessDate = (value: string | Date) => businessDayFormatter.format(new Date(value))
const date = (key: string) => new Date(`${key}T00:00:00Z`)
export const shiftDay = (key: string, days: number) => { const d=date(key); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10) }
const monthEnd = (key: string) => new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7)),0)).toISOString().slice(0,10)
const monday = (key: string) => shiftDay(key,-((date(key).getUTCDay()+6)%7))
export const displayDay = (key: string) => displayDayFormatter.format(date(key))
const sum = <T,>(rows:T[],value:(row:T)=>number) => rows.reduce((total,row)=>total+Number(value(row)),0)
const revenueTypes = new Set(['payment','purged_payment','purged_recorded_sale'])

function emptyTotals() {
  return {revenue:0,expenses:0,withdrawals:0,adjustments:0,profit:0,movement:0,
    orders:0,orderValue:0,completed:0,delivered:0,newCustomers:0,receivedCount:0,recordedSales:0,
    transactions:[] as AppSnapshot['walletTransactions'],orderRows:[] as Order[]}
}
const totalFields = ['revenue','expenses','withdrawals','adjustments','profit','movement','orders','orderValue','completed','delivered','newCustomers','receivedCount','recordedSales'] as const
// Snapshots are immutable: each refresh produces a new object. Reuse its index
// across filters and report buckets without retaining old snapshots indefinitely.
const reportIndexes = new WeakMap<AppSnapshot,Map<string,ReturnType<typeof emptyTotals>>>()
function reportIndex(snapshot:AppSnapshot) {
  const cached=reportIndexes.get(snapshot)
  if(cached)return cached
  const days=new Map<string,ReturnType<typeof emptyTotals>>()
  const dateKeys=new Map<string,string>()
  const at=(timestamp:string)=>{
    let key=dateKeys.get(timestamp)
    if(!key){key=businessDate(timestamp);dateKeys.set(timestamp,key)}
    let totals=days.get(key)
    if(!totals){totals=emptyTotals();days.set(key,totals)}
    return totals
  }
  for(const tx of snapshot.walletTransactions){
    const totals=at(tx.created_at),amount=Number(tx.amount)
    totals.transactions.push(tx);totals.movement+=amount
    if(revenueTypes.has(tx.type)){totals.revenue+=amount;totals.receivedCount++}
    if(tx.type==='expense')totals.expenses-=amount
    if(tx.type==='withdrawal')totals.withdrawals-=amount
    if(tx.type==='adjustment')totals.adjustments+=amount
  }
  for(const order of snapshot.orders){
    if(order.deleted_at)continue
    const totals=at(order.created_at)
    totals.orders++;totals.orderRows.push(order)
    if(order.status!=='cancelled')totals.orderValue+=Number(order.price)
    if(order.completed_at)at(order.completed_at).completed++
    if(order.delivered_at)at(order.delivered_at).delivered++
  }
  for(const customer of snapshot.customers)if(!customer.deleted_at)at(customer.created_at).newCustomers++
  for(const sale of snapshot.recordedSales??[]){
    if(!sale.verified)continue
    // record_date is a calendar date rather than an instant.
    let totals=days.get(sale.record_date)
    if(!totals){totals=emptyTotals();days.set(sale.record_date,totals)}
    totals.recordedSales++
  }
  for(const totals of days.values())totals.profit=totals.revenue-totals.expenses
  reportIndexes.set(snapshot,days)
  return days
}

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
  const totals=emptyTotals()
  for(const [key,day] of reportIndex(snapshot)){
    if(key<from||key>to)continue
    for(const field of totalFields)totals[field]+=day[field]
    totals.transactions.push(...day.transactions)
    totals.orderRows.push(...day.orderRows)
  }
  return totals
}

export function dashboardData(snapshot:AppSnapshot,period:DashboardPeriod,anchor:string,unit:BreakdownUnit,now=new Date()) {
  const today=businessDate(now)
  const dates=[today,...reportIndex(snapshot).keys()].sort()
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
  const visibleOrderIds=new Set(snapshot.orders.filter(o=>!o.deleted_at).map(o=>o.id))
  const proofs=snapshot.payments.filter(p=>p.status==='pending'&&visibleOrderIds.has(p.order_id))
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
    breakdown.push({key,label:unit==='month'?displayMonthFormatter.format(date(key)):unit==='week'?`${displayDay(cursor)} – ${displayDay(to)}`:displayDay(key),from:cursor,to,...values})
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
