import {describe,expect,it} from 'vitest'
import type {AppSnapshot,Order,WalletTransaction} from '../types'
import {businessDate,dashboardData,dashboardRange,monthlyTargetSeries,periodTotals} from './dashboard'

const tx=(id:string,type:WalletTransaction['type'],amount:number,at:string,reference_type='payment',reference_id=id):WalletTransaction=>({id,type,amount,created_at:at,reference_type,reference_id,description:id})
const order=(id:string,created_at:string,overrides:Partial<Order>={}):Order=>({id,order_number:id,customer_id:'customer',service_id:'audio',track_name:id,language:'Malayalam',status:'delivered',payment_status:'confirmed',price:999,created_by:'owner',created_at,updated_at:created_at,...overrides})
function snapshot():AppSnapshot{return {
  services:[{id:'audio',code:'AU150',name:'Audio',price:150,active:true,sort_order:1,created_at:'2026-01-01',updated_at:'2026-01-01'}],profiles:[],customers:[{id:'customer',name:'Customer',phone:'1234567890',total_orders:1,lifetime_revenue:100,created_at:'2026-10-22T18:30:00Z',updated_at:'2026-10-23T00:00:00Z'}],
  inventorySummary:{totalAssets:1,totalRevenue:100,reusedAssets:0,topTrack:null,languages:[]},
  orders:[order('old','2026-09-01T00:00:00Z',{completed_at:'2026-10-22T18:29:59Z',delivered_at:'2026-10-22T18:30:00Z'}),order('new','2026-10-22T18:30:00Z',{status:'in_progress',payment_status:'unpaid',due_date:'2026-10-22',price:350}),order('cancelled','2026-10-23T02:00:00Z',{status:'cancelled',price:500})],
  payments:[{id:'p1',order_id:'old',amount:100,status:'confirmed',uploaded_by:'owner',created_at:'2026-10-23T00:00:00Z'}],
  walletTransactions:[tx('opening','adjustment',1000,'2026-09-01T00:00:00Z'),tx('before','payment',20,'2026-10-22T18:29:59Z'),tx('p1','payment',100,'2026-10-22T18:30:00Z'),tx('recorded','payment',150,'2026-10-23T01:00:00Z','recorded_sale'),tx('anonymous','purged_payment',50,'2026-10-23T01:00:00Z'),tx('cost','expense',-40,'2026-10-23T01:00:00Z'),tx('withdrawal','withdrawal',-60,'2026-10-23T01:00:00Z'),tx('adjust','adjustment',10,'2026-10-23T01:00:00Z')],
  recordedSales:[{id:'recorded',source_ref:'source',record_date:'2026-10-23',quoted_amount:150,currency:'INR',verified:true,fulfillment_hint:'audio',created_at:'2026-10-23'}],expenses:[],withdrawals:[],notifications:[],auditLogs:[],monthlyTarget:null,syncedAt:'2026-10-23T10:00:00Z'
}}
describe('dashboard reporting',()=>{
  it('plots current-month receipts cumulatively and keeps future receipts out of the projection',()=>{
    const data=snapshot()
    data.monthlyTarget={month_start:'2026-10-01',target_amount:3100,updated_by:'owner',updated_at:'2026-10-23'}
    data.walletTransactions.push(tx('future','payment',900,'2026-10-24T12:00:00Z'))
    const series=monthlyTargetSeries(data,new Date('2026-10-23T10:00:00Z'))
    expect(series).toHaveLength(31)
    expect(series[21]).toMatchObject({actual:20,plan:2200,projection:null})
    expect(series[22]).toMatchObject({actual:320,plan:2300,projection:320})
    expect(series[23].actual).toBeNull()
    expect(series[30].projection).toBeCloseTo(320/23*31)
    expect(series[30].plan).toBe(3100)
  })
  it('uses India midnight and each event date without counting quoted prices as revenue',()=>{
    const totals=periodTotals(snapshot(),'2026-10-23','2026-10-23')
    expect(businessDate('2026-10-22T18:30:00Z')).toBe('2026-10-23')
    expect(totals.revenue).toBe(300)
    expect(totals.expenses).toBe(40)
    expect(totals.profit).toBe(260)
    expect(totals.withdrawals).toBe(60)
    expect(totals.adjustments).toBe(10)
    expect(totals.movement).toBe(210)
    expect(totals.orders).toBe(2)
    expect(totals.orderValue).toBe(350)
    expect(totals.delivered).toBe(1)
    expect(totals.completed).toBe(0)
    expect(totals.newCustomers).toBe(1)
  })
  it('keeps current wallet and current overdue work independent of historical report dates',()=>{
    const data=dashboardData(snapshot(),'day','2026-09-02','day',new Date('2026-10-23T10:00:00Z'))
    expect(data.totals.revenue).toBe(0)
    expect(Object.is(data.totals.expenses,-0)).toBe(false)
    expect(Object.is(data.totals.withdrawals,-0)).toBe(false)
    expect(data.wallet).toBe(1230)
    expect(data.overdue.map(o=>o.id)).toEqual(['new'])
    expect(data.outstandingAmount).toBe(350)
  })
  it('uses Monday weeks and equal elapsed prior periods across month and year boundaries',()=>{
    expect(dashboardRange('week','2026-10-23','2026-10-23','2026-01-01')).toEqual({from:'2026-10-19',to:'2026-10-23',previous:{from:'2026-10-12',to:'2026-10-16'}})
    expect(dashboardRange('month','2026-03-01','2026-03-31','2026-01-01').previous).toEqual({from:'2026-02-01',to:'2026-02-28'})
    expect(dashboardRange('month','2026-01-02','2026-01-23','2025-01-01').previous).toEqual({from:'2025-12-01',to:'2025-12-23'})
  })
  it('reconciles daily, weekly and monthly breakdowns to the complete period including empty buckets',()=>{
    for(const unit of ['day','week','month'] as const){
      const data=dashboardData(snapshot(),'all','2026-10-23',unit,new Date('2026-10-23T10:00:00Z'))
      for(const field of ['revenue','expenses','withdrawals','movement','orders','completed','delivered','newCustomers'] as const){
        expect(data.breakdown.reduce((n,row)=>n+row[field],0)).toBe(data.totals[field])
      }
      expect(data.services.reduce((n,s)=>n+s.value,0)).toBe(data.totals.revenue)
    }
  })
  it('includes the earliest data in all-time reporting and does not duplicate owner-recorded sales',()=>{
    const data=dashboardData(snapshot(),'all','2026-10-23','month',new Date('2026-10-23T10:00:00Z'))
    expect(data.range.from).toBe('2026-09-01')
    expect(data.totals.revenue).toBe(320)
    expect(data.totals.recordedSales).toBe(1)
    expect(data.services.find(s=>s.name==='AU150')?.value).toBe(100)
    expect(data.services.find(s=>s.name==='Recorded sales')?.value).toBe(150)
  })
  it('updates indexed reports after a refresh without changing previous snapshots',()=>{
    const original=snapshot()
    const before=periodTotals(original,'2026-10-23','2026-10-23')
    const refreshed={...original,walletTransactions:[...original.walletTransactions,tx('new-receipt','payment',75,'2026-10-23T12:00:00Z')],orders:original.orders.map(o=>o.id==='new'?{...o,status:'delivered' as const,delivered_at:'2026-10-23T12:00:00Z'}:o)}
    expect(periodTotals(refreshed,'2026-10-23','2026-10-23')).toMatchObject({revenue:375,delivered:2})
    expect(periodTotals(original,'2026-10-23','2026-10-23')).toEqual(before)
    before.transactions.length=0
    before.orderRows.length=0
    expect(periodTotals(original,'2026-10-23','2026-10-23').transactions).toHaveLength(6)
    expect(periodTotals(original,'2026-10-23','2026-10-23').orderRows).toHaveLength(2)
  })
  it('excludes deleted activity and retains net expense reversals across grouped reports',()=>{
    const source=snapshot()
    const data={...source,orders:source.orders.map(o=>({...o,deleted_at:'2026-10-23T12:00:00Z'})),customers:source.customers.map(c=>({...c,deleted_at:'2026-10-23T12:00:00Z'})),walletTransactions:[...source.walletTransactions,tx('reversal','expense',10,'2026-10-23T12:00:00Z')]}
    const report=dashboardData(data,'all','2026-10-23','day',new Date('2026-10-23T12:00:00Z'))
    expect(report.totals).toMatchObject({orders:0,completed:0,delivered:0,newCustomers:0,expenses:30,revenue:320})
    expect(report.breakdown.reduce((n,row)=>n+row.profit,0)).toBe(290)
  })
})
