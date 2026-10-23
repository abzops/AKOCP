import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {DashboardPage} from './DashboardPage'

const state=vi.hoisted(()=>({navigate:vi.fn(),csv:vi.fn(),snapshot:{
  services:[],profiles:[],customers:[],inventorySummary:{totalAssets:30,totalRevenue:0,reusedAssets:0,topTrack:null,languages:[]},orders:[],recordedSales:[],payments:[],expenses:[],withdrawals:[],notifications:[],auditLogs:[],monthlyTarget:null,syncedAt:'2026-10-23T09:00:00Z',
  walletTransactions:[{id:'previous',type:'payment',amount:500,reference_type:'recorded_sale',reference_id:'p',description:'Previous month',created_at:'2026-09-01T00:00:00Z'},{id:'today',type:'payment',amount:150,reference_type:'recorded_sale',reference_id:'t',description:'Today receipt',created_at:'2026-10-23T00:00:00Z'}]
}}))
vi.mock('react-router-dom',()=>({useNavigate:()=>state.navigate}))
vi.mock('../context/AuthContext',()=>({useAuth:()=>({profile:{full_name:'Owner',role:'founder'}})}))
vi.mock('../context/AppDataContext',()=>({useAppData:()=>({snapshot:state.snapshot,offline:false})}))
vi.mock('../lib/format',async importOriginal=>({...await importOriginal<typeof import('../lib/format')>(),downloadCsv:state.csv}))
vi.mock('recharts',()=>({Area:()=>null,AreaChart:()=>null,Line:()=>null,LineChart:()=>null,CartesianGrid:()=>null,ResponsiveContainer:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null}))
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T09:00:00Z'))})
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks()})
const financialCard=(name:string)=>screen.getByText(name,{exact:true}).closest('section')!
describe('dashboard controls',()=>{
  it('leads with the current-month target and keeps it independent of report filters',()=>{
    Object.assign(state.snapshot,{monthlyTarget:{month_start:'2026-10-01',target_amount:1000,updated_by:'owner',updated_at:'2026-10-23'}})
    render(<DashboardPage/>);
    const target=screen.getByRole('region',{name:'Current monthly revenue target'})
    expect(within(target).getByRole('img',{name:'15.0 percent of monthly target received'})).toBeInTheDocument()
    expect(within(target).getByText('₹95')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'All time'}))
    expect(within(target).getByText('₹150',{exact:true})).toBeInTheDocument()
    expect(within(target).getByText('₹850',{exact:true})).toBeInTheDocument()
    expect(target.compareDocumentPosition(screen.getByRole('region',{name:'Dashboard date filters'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    Object.assign(state.snapshot,{monthlyTarget:null})
  })
  it('switches all-time and daily financial data while keeping the wallet current',()=>{
    render(<DashboardPage/>);
    fireEvent.click(screen.getByRole('button',{name:'All time'}))
    expect(within(financialCard('Revenue received')).getByText('₹650',{exact:true})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Day'}))
    expect(within(financialCard('Revenue received')).getByText('₹150',{exact:true})).toBeInTheDocument()
    expect(within(financialCard('Current wallet')).getByText('₹650',{exact:true})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Previous period'}))
    expect(within(financialCard('Revenue received')).getByText('₹0',{exact:true})).toBeInTheDocument()
    expect(screen.getByLabelText('Choose report date')).toHaveValue('2026-10-22')
  })
  it('exports every selected breakdown row and opens filtered action pages',()=>{
    render(<DashboardPage/>);
    fireEvent.click(screen.getByRole('button',{name:'All time'}))
    fireEvent.click(screen.getByRole('button',{name:'Export report'}))
    expect(state.csv.mock.calls[0][0]).toBe('AKOCP-month-2026-09-01-2026-10-23.csv')
    expect(state.csv.mock.calls[0][1]).toHaveLength(2)
    expect(state.csv.mock.calls[0][1][0]['Revenue received']).toBe(500)
    fireEvent.click(screen.getByRole('button',{name:/Overdue/}))
    expect(state.navigate).toHaveBeenCalledWith('/orders?view=overdue')
    fireEvent.click(screen.getByRole('button',{name:'New order'}))
    expect(state.navigate).toHaveBeenCalledWith('/orders?new=1')
  })
})

