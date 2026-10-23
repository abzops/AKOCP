import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { operatingPlan } from '../lib/operations'
import { formatCurrency } from '../lib/format'
import type { AppSnapshot } from '../types'

export function DashboardPlan({snapshot,now}:{snapshot:AppSnapshot;now:Date}) {
  const plan=useMemo(()=>operatingPlan(snapshot,now),[snapshot,now])
  const navigate=useNavigate()
  const actions=[{label:'Due today',count:plan.due.length,url:'/orders?view=due_today'},{label:'Overdue',count:plan.overdue.length,url:'/orders?view=overdue'},{label:'Ready to deliver',count:plan.ready.length,url:'/orders?status=completed'},{label:'Payment proofs',count:plan.proofs.length,url:'/orders?view=payment_review'},{label:'Unassigned',count:plan.unassigned.length,url:'/orders?view=unassigned'},{label:'Revisions',count:plan.revisions.length,url:'/orders?view=revisions'}]
  const max=Math.max(plan.month.revenue,plan.booked,plan.deliveredValue,1)
  return <>
    <section className="ops-plan" aria-label="Today's action plan"><div className="ops-section-heading"><div><span>Turn the target into action</span><h2>Today’s plan</h2></div><button className="text-action" onClick={()=>navigate('/orders?new=1')}>Add next order <ArrowRight size={15}/></button></div>
      <div className="ops-daily-goal"><div><span>Next daily cash goal</span><strong>{formatCurrency(plan.dailyGoal)}</strong><small>Remaining monthly target spread over days left, including today</small></div><div><span>Approximate paid orders needed</span><strong>{plan.ordersNeeded??'—'}</strong><small>{plan.avgOrder?`At ${formatCurrency(plan.avgOrder)} average quoted value · service mix may vary`:'Set service prices to estimate'}</small></div><div><span>Received today</span><strong>{formatCurrency(plan.daily.revenue)}</strong><small>{plan.daily.orders} new orders · {plan.daily.delivered} deliveries today</small></div></div>
      <div className="ops-action-grid">{actions.map(action=><button key={action.label} onClick={()=>navigate(action.url)}><span>{action.label}<ArrowRight size={14}/></span><strong>{action.count}</strong></button>)}</div>
      <div className="ops-plan-footer"><button onClick={()=>navigate('/orders?view=unpaid')}>{formatCurrency(plan.collectible)} unconfirmed quote balance <ArrowRight size={14}/></button><button onClick={()=>navigate('/orders?view=balance_review')}>{plan.review.length} payment differences to review <ArrowRight size={14}/></button><button onClick={()=>navigate('/customers?segment=inactive')}>Customer follow-ups <ArrowRight size={14}/></button></div>
    </section>
    <section className="ops-forecast" aria-label="Revenue forecast context"><div className="ops-section-heading"><div><span>Keep cash and work separate · this month</span><h2>A clearer view of your pace</h2></div></div><div className="ops-forecast-body"><div className="ops-work-bars">{[{label:'Cash received',value:plan.month.revenue},{label:'Orders booked · quoted value',value:plan.booked},{label:'Work delivered · quoted value',value:plan.deliveredValue}].map(item=><div key={item.label}><span>{item.label}<strong>{formatCurrency(item.value)}</strong></span><div><i style={{width:`${item.value/max*100}%`}}/></div></div>)}<p>Different event dates and values. These figures are not added together.</p></div><div className="ops-pace-options"><div><span>Month-end at last 7 days’ cash pace</span><strong>{formatCurrency(plan.forecast7)}</strong><small>{formatCurrency(plan.recent7)} per calendar day</small></div><div><span>Month-end at last 30 days’ cash pace</span><strong>{formatCurrency(plan.forecast30)}</strong><small>{formatCurrency(plan.recent30)} per calendar day</small></div><p>{plan.concentrated?'Receipts are concentrated in a single day. Batch confirmations can inflate projections. ':''}These are scenarios, not promised revenue. They include confirmed receipts, not expected orders.</p></div></div></section>
  </>
}
