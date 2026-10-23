import { useState } from 'react'
import { Button, Modal, Select, Textarea } from './ui'
import { followupDraft, orderBalance, whatsappNumber } from '../lib/operations'
import { useAppData } from '../context/AppDataContext'
import type { Customer, Order } from '../types'

export function FollowupComposer({customer,order}:{customer:Customer;order?:Order}) {
  const {snapshot,showToast}=useAppData()
  const [open,setOpen]=useState(false),[kind,setKind]=useState<'enquiry'|'payment'|'delivery'|'returning'>(order?'enquiry':'returning'),[message,setMessage]=useState('')
  const balance=order&&snapshot?orderBalance(order,snapshot.payments):null
  const phone=whatsappNumber(customer.whatsapp||customer.phone)
  return <><Button variant="secondary" onClick={()=>{setMessage(followupDraft(customer,kind,order,balance?.review?undefined:balance?.collectible));setOpen(true)}}>Prepare follow-up</Button><Modal open={open} onClose={()=>setOpen(false)} title={`Follow up · ${customer.name}`} description="Review and edit the message before opening WhatsApp." footer={<><Button variant="ghost" onClick={()=>setOpen(false)}>Close</Button><Button variant="secondary" onClick={()=>void navigator.clipboard.writeText(message).then(()=>showToast({type:'success',title:'Draft copied'})).catch(()=>showToast({type:'error',title:'Could not copy. Select the message and copy it manually.'}))}>Copy draft</Button>{phone.length>=10&&<a className="btn btn-primary" href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Open WhatsApp draft</a>}</>}><div className="form-stack"><Select label="Message purpose" value={kind} onChange={e=>{const next=e.target.value as typeof kind;setKind(next);setMessage(followupDraft(customer,next,order,balance?.review?undefined:balance?.collectible))}}><option value="returning">Returning customer</option>{order&&<><option value="enquiry">Enquiry follow-up</option><option value="payment">Payment reminder</option><option value="delivery">Delivery update</option></>}</Select>{kind==='payment'&&balance?.review&&<p className="form-notice">This order has a payment difference to review. The draft does not request that difference.</p>}<Textarea label="Message draft" rows={7} value={message} onChange={e=>setMessage(e.target.value)}/><p className="form-notice">Nothing is sent automatically. Opening a draft shares this text with WhatsApp; you decide whether to send it there.</p></div></Modal></>
}
