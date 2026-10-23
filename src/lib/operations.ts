import type { AppSnapshot, Customer, Order, Payment } from '../types'
import { businessDate, periodTotals, shiftDay } from './dashboard'

export const acquisitionChannels={unknown:'Not recorded',instagram:'Instagram',facebook:'Facebook',whatsapp:'WhatsApp',referral:'Referral',repeat:'Returning customer',other:'Other'} as const
export type AcquisitionChannel=keyof typeof acquisitionChannels
export function orderBalance(order:Order,payments:Payment[]) {
  const rows=payments.filter(p=>p.order_id===order.id)
  const received=rows.filter(p=>p.status==='confirmed').reduce((n,p)=>n+Number(p.amount),0)
  const pending=rows.filter(p=>p.status==='pending').reduce((n,p)=>n+Number(p.amount),0)
  const difference=Number(order.price)-received
  const excluded=order.status==='cancelled'||order.payment_status==='refunded'
  const review=!excluded&&((order.payment_status==='confirmed'&&Math.abs(difference)>.005)||difference<-.005)
  return {rows,received,pending,difference,balance:Math.max(difference,0),review,
    collectible:!excluded&&!review?Math.max(difference,0):0,
    label:excluded?order.payment_status==='refunded'?'Refunded':'Cancelled':review?'Review difference':received>=Number(order.price)?'Paid':received>0?'Part paid':pending>0?'Proof pending':'Unpaid'}
}

export function operatingPlan(snapshot:AppSnapshot,now=new Date()) {
  const today=businessDate(now),monthStart=`${today.slice(0,7)}-01`
  const day=Number(today.slice(-2)),totalDays=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).getUTCDate()
  const month=periodTotals(snapshot,monthStart,today),daily=periodTotals(snapshot,today,today)
  const target=Number(snapshot.monthlyTarget?.target_amount??0)
  const dailyGoal=target?Math.ceil(Math.max(target-month.revenue,0)/(totalDays-day+1)):0
  const recentOrders=snapshot.orders.filter(o=>!o.deleted_at&&o.status!=='cancelled'&&businessDate(o.created_at)>=shiftDay(today,-29)&&businessDate(o.created_at)<=today&&Number(o.price)>0)
  const avgOrder=recentOrders.length?recentOrders.reduce((n,o)=>n+Number(o.price),0)/recentOrders.length:Number(snapshot.services.find(s=>s.active&&s.code==='ML350')?.price??0)
  const open=snapshot.orders.filter(o=>!o.deleted_at&&!['delivered','cancelled'].includes(o.status))
  const balances=snapshot.orders.filter(o=>!o.deleted_at).map(order=>({order,...orderBalance(order,snapshot.payments)}))
  const sevenFrom=shiftDay(today,-6),thirtyFrom=shiftDay(today,-29)
  const seven=periodTotals(snapshot,sevenFrom,today),thirty=periodTotals(snapshot,thirtyFrom,today)
  const recentDaily=Array.from({length:day},(_,i)=>periodTotals(snapshot,`${today.slice(0,7)}-${String(i+1).padStart(2,'0')}`,`${today.slice(0,7)}-${String(i+1).padStart(2,'0')}`).revenue)
  return {today,daily,month,dailyGoal,avgOrder,ordersNeeded:avgOrder?Math.ceil(dailyGoal/avgOrder):null,
    due:open.filter(o=>o.due_date===today),overdue:open.filter(o=>o.due_date&&o.due_date<today),ready:open.filter(o=>o.status==='completed'),
    unassigned:open.filter(o=>!o.assigned_to),revisions:snapshot.orders.filter(o=>!o.deleted_at&&o.revision_requested),
    proofs:snapshot.payments.filter(p=>p.status==='pending'&&snapshot.orders.some(o=>o.id===p.order_id&&!o.deleted_at)),
    collectible:balances.reduce((n,b)=>n+b.collectible,0),review:balances.filter(b=>b.review),
    recent7:seven.revenue/7,recent30:thirty.revenue/30,
    forecast7:month.revenue+seven.revenue/7*(totalDays-day),forecast30:month.revenue+thirty.revenue/30*(totalDays-day),
    concentrated:day>=7&&month.revenue>0&&Math.max(...recentDaily)/month.revenue>=.35,
    booked:month.orderValue,deliveredValue:snapshot.orders.filter(o=>!o.deleted_at&&o.delivered_at&&businessDate(o.delivered_at)>=monthStart&&businessDate(o.delivered_at)<=today).reduce((n,o)=>n+Number(o.price),0)}
}

export function customerSegment(customer:Customer,today=businessDate(new Date())) {
  if(!customer.last_ordered_at)return 'unknown'
  const last=businessDate(customer.last_ordered_at)
  return last<=shiftDay(today,-30)?'inactive':customer.total_orders>1?'returning':'recent'
}
export function whatsappNumber(value:string) {
  const digits=value.replace(/\D/g,'')
  return digits.length===10?`91${digits}`:digits
}
export function followupDraft(customer:Customer,kind:'enquiry'|'payment'|'delivery'|'returning',order?:Order,balance?:number) {
  const hello=`Hi ${customer.name},`
  if(kind==='payment')return `${hello} a quick update on ${order?.order_number??'your karaoke order'}${order?` (${order.track_name})`:''}: ${balance!=null?`₹${balance.toLocaleString('en-IN')} remains against the quote. `:''}Please share the payment reference when convenient. Thank you, Abhinand Karaokes.`
  if(kind==='delivery')return `${hello} your karaoke${order?` for ${order.track_name}`:''} is ready. ${order?.final_file_url?`Your file: ${order.final_file_url}. `:''}Please let us know if you need any corrections. Thank you, Abhinand Karaokes.`
  if(kind==='enquiry')return `${hello} following up on your karaoke enquiry${order?` for ${order.track_name}`:''}. Would you like us to proceed? Thank you, Abhinand Karaokes.`
  return `${hello} hope you enjoyed your last karaoke from us. Is there a song you would like to sing next? Happy to help. — Abhinand Karaokes`
}

export function growthData(snapshot:AppSnapshot,from:string,to:string) {
  const rows=Object.keys(acquisitionChannels).map(key=>({key:key as AcquisitionChannel,label:acquisitionChannels[key as AcquisitionChannel],orders:0,paid:0,revenue:0,adSpend:0,repeat:0}))
  const byChannel=new Map(rows.map(r=>[r.key,r]))
  const paymentsByOrder=new Map<string,number>()
  snapshot.payments.filter(p=>p.status==='confirmed').forEach(p=>paymentsByOrder.set(p.order_id,(paymentsByOrder.get(p.order_id)??0)+Number(p.amount)))
  const firstOrder=new Map<string,string>()
  snapshot.orders.filter(o=>!o.deleted_at&&o.status!=='cancelled').forEach(o=>{const first=firstOrder.get(o.customer_id);if(!first||o.created_at<first)firstOrder.set(o.customer_id,o.created_at)})
  for(const order of snapshot.orders){
    const day=businessDate(order.created_at)
    if(order.deleted_at||day<from||day>to||order.status==='cancelled')continue
    const row=byChannel.get(order.acquisition_source??'unknown')??rows[0]
    row.orders++;const paid=paymentsByOrder.get(order.id)??0
    if(paid>0)row.paid++
    row.revenue+=paid
    if((firstOrder.get(order.customer_id)??order.created_at)<order.created_at)row.repeat++
  }
  for(const expense of snapshot.expenses){
    if(expense.deleted_at||expense.status!=='approved'||expense.category!=='meta_ads'||expense.expense_date<from||expense.expense_date>to)continue
    const row=byChannel.get(expense.acquisition_source??'unknown')??rows[0]
    row.adSpend+=Number(expense.amount)
  }
  return rows.filter(r=>r.orders||r.adSpend)
}
