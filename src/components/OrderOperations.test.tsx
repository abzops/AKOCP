import {afterEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {OrderOperations,OrderPayments} from './OrderOperations'
import {OrderBoard} from './OrderBoard'
import {FollowupComposer} from './FollowupComposer'
import {Modal} from './ui'
import type {Customer,Order} from '../types'
const mocks=vi.hoisted(()=>({save:vi.fn(),confirm:vi.fn(),toast:vi.fn(),execute:vi.fn(async(_id:string,_message:string,action:()=>Promise<unknown>)=>action())}))
const customer:Customer={id:'c',name:'Test Customer',phone:'9876543210',total_orders:1,lifetime_revenue:100,created_at:'2026-10-01',updated_at:'2026-10-23'}
const order:Order={id:'o',order_number:'AK-TEST',customer_id:'c',service_id:'s',track_name:'Test Song',language:'Malayalam',status:'in_progress',payment_status:'confirmed',price:350,created_by:'owner',created_at:'2026-10-23T00:00:00Z',updated_at:'2026-10-23T00:00:00Z',customer:{id:'c',name:'Test Customer',phone:'9876543210'}}
vi.mock('../context/AuthContext',()=>({useAuth:()=>({profile:{id:'owner',role:'founder'}})}))
vi.mock('../context/AppDataContext',()=>({useAppData:()=>({snapshot:{profiles:[{id:'owner',full_name:'Owner',active:true}],orders:[order],payments:[{id:'p',order_id:'o',amount:100,status:'confirmed',created_at:'2026-10-23T00:00:00Z'}]},service:{updateOrderOperations:mocks.save,confirmPayment:mocks.confirm},execute:mocks.execute,showToast:mocks.toast,busyAction:null})}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
describe('order operation workflows',()=>{
  it('shows actual receipts and routes additional payment entry without changing status',()=>{
    const upload=vi.fn();render(<OrderPayments order={order} onUpload={upload}/>)
    expect(screen.getByText('Review difference')).toBeInTheDocument()
    expect(screen.getByText('₹250')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Record another payment'}))
    expect(upload).toHaveBeenCalledOnce();expect(mocks.confirm).not.toHaveBeenCalled()
  })
  it('saves source and delivery details through the existing order access boundary',async()=>{
    render(<OrderOperations order={order}/>)
    fireEvent.change(screen.getByLabelText('Enquiry source'),{target:{value:'referral'}})
    fireEvent.change(screen.getByLabelText(/Final file link/),{target:{value:'https://example.test/final'}})
    fireEvent.change(screen.getByLabelText('Delivery version'),{target:{value:'v2'}})
    fireEvent.click(screen.getByLabelText('Revision requested'))
    fireEvent.click(screen.getByRole('button',{name:'Save delivery & source details'}))
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith('o',expect.objectContaining({acquisition_source:'referral',final_file_url:'https://example.test/final',delivery_version:'v2',revision_requested:true})))
  })
  it('opens board cards for review without silently changing workflow status',()=>{
    const open=vi.fn();render(<OrderBoard orders={[order]} payments={[]} onOpen={open}/>)
    fireEvent.click(screen.getByRole('button',{name:/^AK-TEST/}))
    expect(open).toHaveBeenCalledWith(order);expect(mocks.save).not.toHaveBeenCalled()
  })
  it('lets the user edit a follow-up and only prepares a WhatsApp link',()=>{
    render(<FollowupComposer customer={customer} order={order}/>)
    fireEvent.click(screen.getByRole('button',{name:'Prepare follow-up'}))
    fireEvent.change(screen.getByLabelText('Message draft'),{target:{value:'My edited message'}})
    expect(screen.getByRole('link',{name:'Open WhatsApp draft'})).toHaveAttribute('href','https://wa.me/919876543210?text=My%20edited%20message')
    expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled()
  })
  it('closes the follow-up first on Escape and keeps the underlying order scroll lock',()=>{
    const closeParent=vi.fn()
    render(<Modal open onClose={closeParent} title="Underlying order"><FollowupComposer customer={customer}/></Modal>)
    fireEvent.click(screen.getByRole('button',{name:'Prepare follow-up'}))
    fireEvent.keyDown(window,{key:'Escape'})
    expect(screen.queryByRole('dialog',{name:'Follow up · Test Customer'})).not.toBeInTheDocument()
    expect(screen.getByRole('dialog',{name:'Underlying order'})).toBeInTheDocument()
    expect(document.body).toHaveClass('modal-open');expect(closeParent).not.toHaveBeenCalled()
  })
})
