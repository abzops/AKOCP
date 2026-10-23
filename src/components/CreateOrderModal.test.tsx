import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateOrderModal } from './CreateOrderModal'

const state = vi.hoisted(() => ({
  profile: { id:'owner',role:'founder' },
  service: { searchInventory:vi.fn(),createOrder:vi.fn() },
  execute:vi.fn(),
  snapshot: {
    services:[{id:'audio',code:'AU150',price:150,active:true},{id:'video',code:'ML350',price:350,active:true},{id:'other',code:'OL450',price:450,active:true},{id:'ready',code:'EX250',price:250,active:true}],
    customers:[{id:'customer',name:'Returning Customer',phone:'9876543210',whatsapp:'9876543210',place:'Kochi',age:32}],
    profiles:[{id:'owner',full_name:'Owner',active:true}]
  }
}))
vi.mock('../context/AuthContext',()=>({useAuth:()=>({profile:state.profile})}))
vi.mock('../context/AppDataContext',()=>({useAppData:()=>({...state,busyAction:null})}))

afterEach(()=>{cleanup();vi.clearAllMocks()})
beforeEach(()=>{
  state.service.searchInventory.mockResolvedValue({items:[]})
  state.service.createOrder.mockResolvedValue(undefined)
  state.execute.mockImplementation(async (_name,_message,action)=>{try{return await action()}catch{return undefined}})
})
const fillBasic=()=>{
  fireEvent.change(screen.getByLabelText(/^Phone number/),{target:{value:'+968 95171126'}})
  fireEvent.change(screen.getByLabelText(/^Customer name/),{target:{value:'New Customer'}})
  fireEvent.change(screen.getByLabelText(/^Song title/),{target:{value:'New song'}})
}
const submit=()=>fireEvent.submit(screen.getByLabelText(/^Song title/).closest('form')!)

describe('quick order entry',()=>{
  it('uses an optional custom price for this order and returns to the service price when cleared',async()=>{
    render(<CreateOrderModal open onClose={vi.fn()} />)
    fillBasic()
    const price=screen.getByLabelText(/^Custom price/)
    expect(price).not.toBeRequired()
    fireEvent.change(price,{target:{value:'275.50'}})
    expect(screen.getByRole('button',{name:/Create order/})).toHaveTextContent('₹275.5')
    fireEvent.change(price,{target:{value:''}})
    expect(screen.getByRole('button',{name:/Create order/})).toHaveTextContent('₹350')
    fireEvent.change(price,{target:{value:'275.50'}})
    submit()
    await waitFor(()=>expect(state.service.createOrder).toHaveBeenCalled())
    expect(state.service.createOrder.mock.calls[0][0]).toMatchObject({customPrice:'275.50'})
    expect(state.snapshot.services.find(service=>service.code==='ML350')?.price).toBe(350)
  })
  it.each(['0','-1','12.345'])('rejects invalid custom price %s before saving',async(value)=>{
    render(<CreateOrderModal open onClose={vi.fn()} />)
    fillBasic()
    fireEvent.change(screen.getByLabelText(/^Custom price/),{target:{value}})
    submit()
    expect(state.service.createOrder).not.toHaveBeenCalled()
    expect(screen.getByText(/Enter a custom price greater than zero/)).toBeVisible()
  })
  it('creates an order with one song entry and no optional details, preserving international phone numbers',async()=>{
    const close=vi.fn()
    render(<CreateOrderModal open onClose={close} />)
    fillBasic()
    expect(screen.getByLabelText('Place (optional)')).not.toBeRequired()
    expect(screen.getByLabelText('Age (optional)')).not.toBeRequired()
    fireEvent.click(screen.getByRole('button',{name:/Audio karaoke/}))
    submit()
    await waitFor(()=>expect(state.service.createOrder).toHaveBeenCalled())
    expect(state.service.createOrder.mock.calls[0][0]).toMatchObject({customerName:'New Customer',phone:'96895171126',trackName:'New song',serviceId:'audio',place:'',age:''})
    await waitFor(()=>expect(close).toHaveBeenCalledOnce())
  })
  it('fills a returning customer from a +91 phone and saves optional place and age',async()=>{
    render(<CreateOrderModal open onClose={vi.fn()} />)
    const phone=screen.getByLabelText(/^Phone number/)
    fireEvent.change(phone,{target:{value:'+91 9876543210'}})
    fireEvent.blur(phone)
    expect(screen.getByLabelText(/^Customer name/)).toHaveValue('Returning Customer')
    expect(screen.getByLabelText('Place (optional)')).toHaveValue('Kochi')
    expect(screen.getByLabelText('Age (optional)')).toHaveValue(32)
    fireEvent.change(screen.getByLabelText(/^Song title/),{target:{value:'Another song'}})
    fireEvent.change(screen.getByLabelText('Place (optional)'),{target:{value:'Thrissur'}})
    submit()
    await waitFor(()=>expect(state.service.createOrder).toHaveBeenCalled())
    expect(state.service.createOrder.mock.calls[0][0]).toMatchObject({phone:'9876543210',place:'Thrissur',age:'32'})
  })
  it('selects an inventory match without retyping the song or selecting the ready-made service',async()=>{
    state.service.searchInventory.mockResolvedValue({items:[{id:'track',track_name:'Existing song',language:'Tamil',english_title:'Existing song'}]})
    render(<CreateOrderModal open onClose={vi.fn()} />)
    fillBasic()
    fireEvent.click(await screen.findByRole('button',{name:/Use ready-made/}))
    expect(screen.getByRole('button',{name:/Create order/})).toHaveTextContent('₹250')
    submit()
    await waitFor(()=>expect(state.service.createOrder).toHaveBeenCalled())
    expect(state.service.createOrder.mock.calls[0][0]).toMatchObject({inventoryTrackId:'track',trackName:'Existing song',serviceId:'ready',language:'Tamil'})
  })
  it('retains the form when saving fails',async()=>{
    state.service.createOrder.mockRejectedValue(new Error('Connection interrupted'))
    const close=vi.fn()
    render(<CreateOrderModal open onClose={close} />)
    fillBasic(); submit()
    await waitFor(()=>expect(state.service.createOrder).toHaveBeenCalled())
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^Song title/)).toHaveValue('New song')
  })
})

