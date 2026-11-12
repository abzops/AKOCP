import { ClipboardList, Headphones, MessageCircle, MicOff, PhoneCall, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useAppData } from '../context/AppDataContext'
import { EnquiryOrderActions, PrivateCallRecording, ReceptionistInventoryVerification } from '../components/ReceptionistPhase2'
import { ReceptionistSetupStatus } from '../components/ReceptionistSetupStatus'
import { malayalamOrderDraft, whatsappDigits, whatsappDraftUrl, type KaraokeFormat } from '../lib/receptionist-core'
import '../receptionist.css'

type Call = {
 id:string; interaction_id:string; caller_phone:string; created_at:string; duration_seconds:number;
 transcript:string|null; recording_consent:'granted'|'declined'|'unknown'; recording_reference:string|null
}
type Request = {
 id:string;call_id:string;item_number:number;customer_name:string|null;song_title:string;
 song_language:string|null;karaoke_format:KaraokeFormat;stock_status:'not_verified'|'available'|'not_available';
 quote_amount:number|null;quote_status:'pending'|'provisional'|'verified';caller_approved:boolean;approval_utterance:string|null;
 whatsapp_phone:string|null;whatsapp_confirmed_by_caller:boolean;review_status:'new'|'reviewed'|'rejected';
 linked_order_id:string|null;created_at:string
}
const callTime=(value:string)=>new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})
const money=(value:number|null)=>value==null?'Price pending':'₹'+Number(value).toLocaleString('en-IN')
export function ReceptionistPage(){
 const {snapshot,refresh}=useAppData()
 const [calls,setCalls]=useState<Call[]>([])
 const [requests,setRequests]=useState<Request[]>([])
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState<string|null>(null)
 const [query,setQuery]=useState('')
 const [phoneEdits,setPhoneEdits]=useState<Record<string,string>>({})
 const [saving,setSaving]=useState<string|null>(null)
 const [notice,setNotice]=useState<string|null>(null)
 const load=useCallback(async()=>{
  setBusy(true);setError(null)
  const [c,r]=await Promise.all([
   supabase.from('receptionist_calls').select('id,interaction_id,caller_phone,created_at,duration_seconds,transcript,recording_consent,recording_reference').order('created_at',{ascending:false}).limit(150),
   supabase.from('receptionist_requests').select('id,call_id,item_number,customer_name,song_title,song_language,karaoke_format,stock_status,quote_amount,quote_status,caller_approved,approval_utterance,whatsapp_phone,whatsapp_confirmed_by_caller,review_status,linked_order_id,created_at').order('created_at',{ascending:false}).limit(300)
  ])
  if(c.error||r.error)setError('Receptionist tables are not ready. Apply the migration to the AKOCP Supabase database; no existing orders have been changed.')
  else{setCalls((c.data??[]) as Call[]);setRequests((r.data??[]) as Request[])}
  setBusy(false)
 },[])
 useEffect(()=>{void load()},[load])
 const byId=useMemo(()=>new Map(calls.map(c=>[c.id,c])),[calls])
 const visible=useMemo(()=>{
  const needle=query.trim().toLowerCase()
  return needle?requests.filter(r=>[r.song_title,r.customer_name,r.song_language,r.whatsapp_phone,byId.get(r.call_id)?.caller_phone].some(x=>x?.toLowerCase().includes(needle))):requests
 },[requests,query,byId])
 const updateReview=async(r:Request)=>{
  setSaving(r.id)
  const out=await supabase.from('receptionist_requests').update({review_status:'reviewed',updated_at:new Date().toISOString()}).eq('id',r.id)
  if(out.error)setNotice('Could not update review. Please retry.')
  else{setRequests(items=>items.map(item=>item.id===r.id?{...item,review_status:'reviewed'}:item));setNotice('Enquiry marked reviewed. No order was created.')}
  setSaving(null)
 }
 const savePhone=async(r:Request)=>{
  const digits=whatsappDigits(phoneEdits[r.id]??r.whatsapp_phone)
  if(!digits){setNotice('Enter a valid WhatsApp number.');return}
  setSaving(r.id)
  const normalized='+'+digits
  const out=await supabase.from('receptionist_requests').update({
   whatsapp_phone:normalized,whatsapp_confirmed_by_caller:false,updated_at:new Date().toISOString()
  }).eq('id',r.id)
  if(out.error)setNotice('Could not save WhatsApp number.')
  else{setRequests(items=>items.map(item=>item.id===r.id?{...item,whatsapp_phone:normalized,whatsapp_confirmed_by_caller:false}:item));setNotice('Number saved. WhatsApp registration is not verified.')}
  setSaving(null)
 }
 return <div className="ak-voice">
  <PageHeader eyebrow="VOICE OPERATIONS" title="AI receptionist" description="Malayalam enquiries, song quotes, caller approvals and WhatsApp handoffs." action={<Button variant="secondary" icon={<RefreshCw size={16}/>} disabled={busy} onClick={()=>void load()}>Refresh</Button>}/>
  <div className="ak-voice-note"><ShieldCheck size={17}/><span>Live calls require Sarvam setup and BSNL call forwarding. Caller approval is not proof of payment or order creation.</span></div>
  <section className="ak-voice-metrics" aria-label="Receptionist metrics">
   <div><PhoneCall size={20}/><strong>{calls.length}</strong><span>Recent calls</span></div>
   <div><ClipboardList size={20}/><strong>{requests.length}</strong><span>Song enquiries</span></div>
   <div><ShieldCheck size={20}/><strong>{requests.filter(r=>r.caller_approved).length}</strong><span>Caller approvals</span></div>
   <div><Headphones size={20}/><strong>{requests.filter(r=>r.review_status==='new').length}</strong><span>Needs review</span></div>
  </section>
  {notice&&<div className="ak-voice-notice" role="status">{notice} <button aria-label="Dismiss" onClick={()=>setNotice(null)}>×</button></div>}
  {error&&<div className="ak-voice-error" role="alert">{error}</div>}
  <ReceptionistSetupStatus/>
  <ReceptionistInventoryVerification/>
  <section className="ak-voice-section">
   <header className="ak-voice-section-heading"><div><h2>Call enquiries</h2><p>Review each request before creating an order.</p></div>
    <label className="ak-voice-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Song, caller, language…" aria-label="Search call enquiries"/></label></header>
   {busy?<div className="ak-voice-empty">Loading…</div>:visible.length===0?<div className="ak-voice-empty">{error?'Backend setup required':'No matching call enquiries yet.'}</div>:
   <div className="ak-voice-list">{visible.map(r=>{
    const call=byId.get(r.call_id)
    const editable=phoneEdits[r.id]??r.whatsapp_phone??''
    const linked=snapshot?.orders.find(order=>order.id===r.linked_order_id)
    const message=malayalamOrderDraft({customer:r.customer_name,song:r.song_title,format:r.karaoke_format,price:r.quote_amount,confirmed:Boolean(r.linked_order_id),orderNumber:linked?.order_number})
    const whatsapp=whatsappDraftUrl(r.whatsapp_phone,message)
    return <article key={r.id} className="ak-voice-row">
     <div className="ak-voice-main">
      <div className="ak-voice-row-head"><div><h3>{r.song_title}</h3><p>{r.song_language??'Language not verified'} · {r.karaoke_format==='video'?'Lyrics video':'Audio'} · {callTime(r.created_at)}</p></div><strong className="ak-voice-price">{money(r.quote_amount)}</strong></div>
      <div className="ak-voice-tags"><span>{r.stock_status==='available'?'Inventory verified':r.stock_status==='not_available'?'Format unavailable':'Stock not verified'}</span><span>{r.caller_approved?'Caller approved':'Enquiry only'}</span><span>{r.quote_status==='provisional'?'Provisional price':r.quote_status==='verified'?'Verified quote':'Price pending'}</span><span>{r.review_status}</span></div>
      <p className="ak-voice-caller"><PhoneCall size={15}/>{r.customer_name||'Caller'} · {call?.caller_phone||'Unknown number'} · Item #{r.item_number}</p>
      <div className="ak-voice-contact"><label><span>Customer's WhatsApp number</span><input type="tel" value={editable} placeholder="Collect WhatsApp number" onChange={e=>setPhoneEdits(prev=>({...prev,[r.id]:e.target.value}))}/></label><Button variant="secondary" disabled={saving===r.id||!whatsappDigits(editable)} onClick={()=>void savePhone(r)}>Save</Button></div>
      <div className="ak-voice-actions">
       {whatsapp?<a className="ak-voice-link primary" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/> Connect with WhatsApp</a>:<span className="ak-voice-muted">Collect WhatsApp number first</span>}
       <Link className="ak-voice-link" to="/orders?new=1"><ClipboardList size={16}/> Open order form</Link>
       {r.review_status==='new'&&<Button variant="ghost" disabled={saving===r.id} onClick={()=>void updateReview(r)}>Mark reviewed</Button>}
      </div>
      <EnquiryOrderActions request={r} onChanged={async()=>{await load();await refresh()}}/>
     </div>
     <aside className="ak-voice-side"><strong>Call record</strong><span>{call?Math.floor(call.duration_seconds/60)+'m '+call.duration_seconds%60+'s':'Not received'}</span><span>{call?.recording_consent==='declined'?<><MicOff size={13}/> Recording declined</>:call?.recording_consent==='granted'?'Consent recorded':'Recording consent unknown'}</span>{call?.transcript&&<details><summary>Read transcript</summary><p>{call.transcript}</p></details>}{call&&<PrivateCallRecording callId={call.id} consent={call.recording_consent} reference={call.recording_reference}/>}</aside>
    </article>
   })}</div>}
  </section>
 </div>
}
