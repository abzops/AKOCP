import { useState } from 'react'
import { Badge, Button, EmptyState } from './ui'
import { formatCurrency, formatDate, fromNow, statusLabels } from '../lib/format'
import { businessDate } from '../lib/dashboard'
import { orderBalance } from '../lib/operations'
import type { Order,OrderStatus,Payment } from '../types'

const columns:OrderStatus[]=['inquiry','payment_pending','in_progress','completed','delivered','cancelled']
export function OrderBoard({orders,payments,onOpen}:{orders:Order[];payments:Payment[];onOpen(order:Order):void}) {
  const [limits,setLimits]=useState<Partial<Record<OrderStatus,number>>>({})
  const today=businessDate(new Date())
  return <div className="ops-board" aria-label="Order workflow board">{columns.map(status=>{
    const rows=orders.filter(o=>o.status===status),limit=limits[status]??10
    return <section key={status} className="ops-board-column" aria-label={`${statusLabels[status]} orders`}><header><h2>{statusLabels[status]}</h2><Badge>{rows.length}</Badge></header><div>{rows.length?rows.slice(0,limit).map(order=>{
      const balance=orderBalance(order,payments),overdue=order.due_date&&order.due_date<today&&!['delivered','cancelled'].includes(status)
      return <button className="ops-board-order" key={order.id} onClick={()=>onOpen(order)}><span>{order.order_number}<b>{formatCurrency(order.price)}</b></span><h3>{order.track_name}</h3><p>{order.customer?.name??'Customer'} · {order.service?.code}</p><div><Badge tone={balance.review?'yellow':balance.balance===0?'green':'blue'}>{balance.label}</Badge>{order.revision_requested&&<Badge tone="yellow">Revision</Badge>}</div><small className={overdue?'ops-overdue':''}>{order.due_date?`Due ${formatDate(order.due_date)}${overdue?' · overdue':''}`:'No due date'}</small><small>{order.assignee?.full_name??'Unassigned'} · Created {fromNow(order.created_at)}</small></button>
    }):<EmptyState title="Clear" description="No orders in this stage."/>}{rows.length>limit&&<Button variant="ghost" onClick={()=>setLimits({...limits,[status]:limit+20})}>Show {Math.min(rows.length-limit,20)} more</Button>}</div></section>
  })}</div>
}
