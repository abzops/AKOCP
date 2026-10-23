import { Pencil, Target } from 'lucide-react'
import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button } from '../components/ui'
import { monthlyTargetSeries } from '../lib/dashboard'
import { formatCurrency } from '../lib/format'
import type { AppSnapshot, MonthlyTargetForecast } from '../types'

export function DashboardTarget({snapshot,forecast,now,onEdit}:{snapshot:AppSnapshot;forecast:MonthlyTargetForecast;now:Date;onEdit():void}) {
  const series=useMemo(()=>monthlyTargetSeries(snapshot,now),[snapshot,now])
  const month=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',month:'long',year:'numeric'}).format(now)
  const totalDays=series.length
  const expected=forecast.target/totalDays*forecast.daysElapsed
  const paceGap=forecast.earned-expected
  const status=forecast.status==='achieved'?'Target reached':forecast.status==='on_track'?'On track':forecast.status==='behind'?'Behind pace':'Set your goal'
  const percent=forecast.target?forecast.earned/forecast.target*100:0
  const ring=2*Math.PI*70
  return <section className="goal-hero" aria-label="Current monthly revenue target">
    <div className="goal-heading"><div><span><Target size={15}/> Your monthly focus · {month}</span><h2>{forecast.target?`${formatCurrency(forecast.target)} revenue target`:'Give this month a target'}</h2></div><div className="goal-heading-actions"><Badge tone={forecast.status==='behind'?'yellow':forecast.target?'green':'yellow'}>{status}</Badge><Button variant="secondary" icon={<Pencil size={14}/>} onClick={onEdit}>{forecast.target?'Edit target':'Set target'}</Button></div></div>
    {forecast.target>0?<>
      <div className="goal-main">
        <div className="goal-progress">
          <div className="goal-ring" role="img" aria-label={`${percent.toFixed(1)} percent of monthly target received`}><svg viewBox="0 0 164 164" aria-hidden="true"><circle className="goal-ring-track" cx="82" cy="82" r="70"/><circle className="goal-ring-fill" cx="82" cy="82" r="70" strokeDasharray={ring} strokeDashoffset={ring*(1-Math.min(Math.max(percent,0),100)/100)} transform="rotate(-90 82 82)"/></svg><div><strong>{percent.toFixed(1)}<small>%</small></strong><span>of target received</span></div></div>
          <div className="goal-earned"><span>Revenue received this month</span><strong>{formatCurrency(forecast.earned)}</strong><p>{forecast.status==='achieved'?`${formatCurrency(Math.max(forecast.earned-forecast.target,0))} above your target`:`${formatCurrency(forecast.remaining)} left to reach your goal`}</p></div>
          <p className={paceGap>=0?'goal-pace positive':'goal-pace'}>{formatCurrency(Math.abs(paceGap))} {paceGap>=0?'ahead of':'behind'} the planned pace</p>
        </div>
        <div className="goal-chart-panel"><div className="goal-chart-heading"><div><h3>Your path to the target</h3><p>Received revenue against a steady daily plan</p></div></div><div className="goal-legend"><span><i/>Received</span><span><i/>Target pace</span><span><i/>Projected</span></div>
          <div className="goal-chart" role="img" aria-label={`Monthly revenue progress: ${formatCurrency(forecast.earned)} received against ${formatCurrency(forecast.target)} target. Projected month end ${formatCurrency(forecast.projectedMonthEnd)}.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{left:0,right:18,top:14,bottom:0}}><CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5"/><XAxis dataKey="day" ticks={[1,8,15,22,totalDays]} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={day=>`${day}`}/><YAxis width={54} axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:10}} tickFormatter={value=>Number(value)>=1000?`${Number(value)/1000}k`:String(value)}/><Tooltip contentStyle={{background:'var(--surface-elevated)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)'}} labelFormatter={day=>`${day} ${month}`} formatter={(value,name)=>[formatCurrency(Number(value)),name==='actual'?'Received':name==='plan'?'Target pace':'Projected']}/><Line name="plan" type="linear" dataKey="plan" stroke="var(--muted)" strokeDasharray="5 5" dot={false} strokeWidth={1.5} isAnimationActive={false}/><Line name="projection" type="linear" dataKey="projection" stroke="var(--success)" strokeDasharray="3 5" dot={false} strokeWidth={2} isAnimationActive={false}/><Line name="actual" type="linear" dataKey="actual" stroke="var(--brand)" dot={false} activeDot={{r:4}} strokeWidth={3} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
          <div className="goal-chart-caption"><span>Day of month</span><span>Projection assumes your average daily revenue continues.</span></div>
        </div>
      </div>
      <div className="goal-actions"><div className="goal-daily"><span>{forecast.status==='achieved'?'Goal completed':'Aim for each day'}</span><strong>{formatCurrency(forecast.dailyRequired)}<small> / day</small></strong><p>{forecast.status==='achieved'?'Keep building on this month’s result.':`Across ${forecast.daysRemaining} days, including today`}</p></div><div><span>Target remaining</span><strong>{formatCurrency(forecast.remaining)}</strong><p>To reach the monthly target</p></div><div><span>Projected month end</span><strong>{formatCurrency(forecast.projectedMonthEnd)}</strong><p>At the current average pace</p></div><div><span>Time remaining</span><strong>{forecast.daysRemaining}<small> days</small></strong><p>{forecast.daysElapsed} of {totalDays} calendar days elapsed</p></div></div>
    </>:<div className="goal-empty"><Target size={38}/><div><h3>One clear goal. A daily plan.</h3><p>Set a monthly revenue target to see your progress ring, pace chart, and the amount to aim for each day.</p></div><Button onClick={onEdit}>Set monthly target</Button></div>}
    <p className="goal-scope">Current month · confirmed revenue in India time · stays on this month when you explore reports below</p>
  </section>
}
