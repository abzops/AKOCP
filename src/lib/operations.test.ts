import {describe,expect,it} from 'vitest'
import {customerSegment,followupDraft,growthData,operatingPlan,orderBalance,whatsappNumber} from './operations'
import type {AppSnapshot,Customer,Order,Payment} from '../types'

const order=(id:string,extra:Partial<Order>={}):Order=>({id,order_number:id,customer_id:'c',service_id:'s',track_name:'Song',language:'Malayalam',status:'inquiry',payment_status:'unpaid',price:350,created_by:'owner',created_at:'2026-10-23T10:00:00Z',updated_at:'2026-10-23T10:00:00Z',...extra})
const payment=(id:string,amount:number,status:Payment['status']='confirmed',order_id='o'):Payment=>({id,order_id,amount,status,uploaded_by:'owner',created_at:'2026-10-23T10:00:00Z'})
const customer:Customer={id:'c',name:'Customer',phone:'9876543210',total_orders:2,lifetime_revenue:350,created_at:'2026-09-01',updated_at:'2026-10-23'}
function snapshot():AppSnapshot{return {services:[],profiles:[],customers:[customer],orders:[],payments:[],walletTransactions:[],expenses:[],withdrawals:[],notifications:[],auditLogs:[],recordedSales:[],monthlyTarget:{month_start:'2026-10-01',target_amount:40000,updated_by:'owner',updated_at:'2026-10-23'},inventorySummary:{totalAssets:0,totalRevenue:0,reusedAssets:0,topTrack:null,languages:[]},syncedAt:'2026-10-23T10:00:00Z'}}
describe('operations decisions',()=>{
  it('separates confirmed receipts from pending proofs and flags settled historical differences',()=>{
    const o=order('o',{payment_status:'confirmed'})
    expect(orderBalance(o,[payment('p',150),payment('q',200,'pending')])).toMatchObject({received:150,pending:200,balance:200,review:true,collectible:0,label:'Review difference'})
    expect(o.payment_status).toBe('confirmed')
    expect(orderBalance(order('o'),[payment('p',150)])).toMatchObject({label:'Part paid',balance:200,collectible:200})
    expect(orderBalance(o,[payment('p',400)])).toMatchObject({difference:-50,collectible:0,review:true})
    expect(orderBalance(order('o',{payment_status:'refunded'}),[]).collectible).toBe(0)
  })
  it('turns the remaining goal into approximate orders and keeps booked and received values separate',()=>{
    const s=snapshot();s.orders=[order('o',{due_date:'2026-10-23'}),order('p',{due_date:'2026-10-22',revision_requested:true})]
    s.walletTransactions=[{id:'t',type:'payment',amount:32700,created_at:'2026-10-23T00:00:00Z',reference_type:'payment',reference_id:'p',description:'Batch receipt'}]
    const plan=operatingPlan(s,new Date('2026-10-23T10:00:00Z'))
    expect(plan).toMatchObject({dailyGoal:812,ordersNeeded:3,avgOrder:350,booked:700,concentrated:true})
    expect(plan.due).toHaveLength(1);expect(plan.overdue).toHaveLength(1);expect(plan.revisions).toHaveLength(1)
    expect(plan.month.revenue).toBe(32700)
    expect(plan.forecast30).toBe(32700+32700/30*8)
    expect(plan.collectible).toBe(700)
  })
  it('attributes cohorts and ad costs without guessing missing source or counting pending receipts',()=>{
    const s=snapshot();s.orders=[order('first',{created_at:'2026-09-01T00:00:00Z'}),order('o',{acquisition_source:'instagram'}),order('unknown',{customer_id:'new'})]
    s.payments=[payment('p',150),payment('q',200,'pending')]
    s.expenses=[{id:'e',amount:50,category:'meta_ads',description:'Ad',expense_date:'2026-10-23',added_by:'owner',status:'approved',created_at:'2026-10-23',acquisition_source:'instagram'}]
    const result=growthData(s,'2026-10-01','2026-10-23')
    expect(result.find(r=>r.key==='instagram')).toMatchObject({orders:1,paid:1,revenue:150,repeat:1,adSpend:50})
    expect(result.find(r=>r.key==='unknown')).toMatchObject({orders:1,paid:0,revenue:0})
  })
  it('segments 30-day inactivity by India dates and builds editable drafts without sending',()=>{
    expect(customerSegment({...customer,last_ordered_at:'2026-09-23T00:00:00Z'},'2026-10-23')).toBe('inactive')
    expect(customerSegment(customer,'2026-10-23')).toBe('unknown')
    expect(whatsappNumber('+91 98765 43210')).toBe('919876543210')
    expect(whatsappNumber('9876543210')).toBe('919876543210')
    expect(whatsappNumber('+1 415 555 1234')).toBe('14155551234')
    expect(followupDraft(customer,'payment',order('o'),200)).toContain('₹200')
    expect(followupDraft(customer,'delivery',order('o',{final_file_url:'https://example.test/song'}))).toContain('https://example.test/song')
  })
})
