import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, FileAudio, ListMusic, LockKeyhole, Music2, Search, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { supabase } from '../lib/supabase'
import { Button } from './ui'
import type { InventoryTrack } from '../types'

export type VerifiedVoiceRequest = {
 id:string; customer_name:string|null; song_title:string; song_language:string|null;
 karaoke_format:'audio'|'video'; stock_status:'not_verified'|'available'|'not_available';
 quote_status:'pending'|'provisional'|'verified'; quote_amount:number|null;
 caller_approved:boolean; approval_utterance:string|null;
 whatsapp_phone:string|null; whatsapp_confirmed_by_caller:boolean;
 linked_order_id:string|null; review_status:'new'|'reviewed'|'rejected'
}
function humanError(error:unknown):string{
 return error instanceof Error?error.message:'Unable to complete request'
}

/** Only the Founder can approve a quote or convert the call lead into an AKOCP order. */
export function EnquiryOrderActions({request,onChanged}:{request:VerifiedVoiceRequest;onChanged:()=>Promise<void>}){
 const {profile}=useAuth()
 const [language,setLanguage]=useState(request.song_language??'')
 const [name,setName]=useState(request.customer_name??'')
 const [checkedUnavailable,setCheckedUnavailable]=useState(false)
 const [acknowledged,setAcknowledged]=useState(false)
 const [working,setWorking]=useState(false)
 const [message,setMessage]=useState('')
 useEffect(()=>{
  setLanguage(request.song_language??'');setName(request.customer_name??'')
  setCheckedUnavailable(false);setAcknowledged(false);setMessage('')
 },[request.id,request.song_language,request.customer_name])
 if(profile?.role!=='founder')return <p className="ak-voice-muted">Founder verification is required before order creation.</p>
 const isReady=request.stock_status==='available'
 const audioReady=isReady&&request.karaoke_format==='audio'
 const verified=request.quote_status==='verified'
 const canConvert=request.caller_approved&&verified&&request.review_status!=='rejected'&&!audioReady
 const verify=async()=>{
  setWorking(true);setMessage('')
  try{
   const {error}=await supabase.rpc('receptionist_verify_quote',{
    p_request_id:request.id,p_language:language.trim(),
    p_confirm_unavailable:!isReady&&checkedUnavailable
   })
   if(error)throw error
   await onChanged()
   setMessage('Founder quote verified. Order is still pending conversion.')
  }catch(error){setMessage(humanError(error))}
  finally{setWorking(false)}
 }
 const convert=async()=>{
  setWorking(true);setMessage('')
  try{
   const {data,error}=await supabase.rpc('receptionist_create_order',{
    p_request_id:request.id,p_customer_name:name.trim(),
    // Only submit a number as WhatsApp when caller actually confirmed it.
    p_whatsapp_phone:request.whatsapp_confirmed_by_caller?request.whatsapp_phone??'':''
   })
   if(error)throw error
   await onChanged()
   setMessage(data?'Order created and linked. Open it in Orders.':'Order conversion returned no ID.')
  }catch(error){setMessage(humanError(error))}
  finally{setWorking(false)}
 }
 return <div className="ak-voice-review">
  {request.linked_order_id? <Link className="ak-voice-link primary" to={'/orders?order='+encodeURIComponent(request.linked_order_id)}>
    <CheckCircle2 size={16}/> Open linked order
   </Link>:
   <>
    <div className="ak-voice-review-fields">
     <label>Verified language<input value={language} onChange={e=>setLanguage(e.target.value)} maxLength={60} placeholder="Malayalam / Tamil / Hindi"/></label>
     <label>Customer name<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="Name before order creation"/></label>
    </div>
    {isReady?<p className="ak-voice-hint">Ready-made {request.karaoke_format}. The track and format price must match the owner-verified inventory.</p>:
      <label className="ak-voice-ack"><input type="checkbox" checked={checkedUnavailable} onChange={e=>setCheckedUnavailable(e.target.checked)}/>
      I checked the stock and confirm this requested format is unavailable.</label>}
    {audioReady?<p className="ak-voice-hint">Ready-made audio requires a separate catalog service mapping; do not label it as ready-made video.</p>:
     <Button variant="secondary" disabled={working||( !isReady&&!checkedUnavailable)||language.trim().length<2} onClick={()=>void verify()}>Verify song & quote</Button>}
    {request.caller_approved&&request.approval_utterance?
      <p className="ak-voice-hint"><strong>Approval heard:</strong> {request.approval_utterance}</p>:
      <p className="ak-voice-hint">Customer approval was not recorded. Do not create the order.</p>}
    <label className="ak-voice-ack"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>
      I reviewed the caller approval, verified price and customer details.</label>
    <Button disabled={!canConvert||!acknowledged||name.trim().length<2||working} onClick={()=>void convert()}>
      Create confirmed order in AKOCP
    </Button>
    {!verified&&<p className="ak-voice-hint"><ShieldAlert size={13}/> Verify the quote before converting to an order.</p>}
   </>
  }
  {message&&<p className="ak-voice-hint" role="status">{message}</p>}
 </div>
}

/** Owner verifies actual audio/video availability and price for each inventory track. */
export function ReceptionistInventoryVerification(){
 const {profile}=useAuth(),{service}=useAppData()
 const [query,setQuery]=useState('')
 const [items,setItems]=useState<InventoryTrack[]>([])
 const [selected,setSelected]=useState<InventoryTrack|null>(null)
 const [audio,setAudio]=useState(false),[video,setVideo]=useState(false)
 const [audioPrice,setAudioPrice]=useState(''),[videoPrice,setVideoPrice]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const [status,setStatus]=useState('')
 const [busy,setBusy]=useState(false)
 const lookup=async(event:FormEvent)=>{
  event.preventDefault();setBusy(true);setStatus('');setSelected(null);setItems([])
  try{
   const data=await service.searchInventory({query:query.trim(),sort:'orders',limit:10})
   setItems(data.items)
   if(data.items.length===0)setStatus('No matching inventory titles; try another spelling.')
  }catch(error){setStatus(humanError(error))}
  finally{setBusy(false)}
 }
 const choose=async(track:InventoryTrack)=>{
  setSelected(track);setConfirmed(false);setAudio(false);setVideo(false);setAudioPrice('');setVideoPrice('');setStatus('')
  const {data,error}=await supabase.from('receptionist_inventory_formats')
   .select('audio_available,video_available,audio_price,video_price,verified_at')
   .eq('inventory_track_id',track.id).maybeSingle()
  if(error){setStatus(humanError(error));return}
  if(data){
   setAudio(Boolean(data.audio_available));setVideo(Boolean(data.video_available))
   setAudioPrice(data.audio_price==null?'':String(data.audio_price))
   setVideoPrice(data.video_price==null?'':String(data.video_price))
   setStatus(data.verified_at?'Previously verified; save again after checking actual files.':'Not yet verified.')
  }
 }
 const save=async()=>{
  if(!selected||!profile||!confirmed)return
  const a=Number(audioPrice),v=Number(videoPrice)
  if((audio&&(!Number.isFinite(a)||a<=0))||(video&&(!Number.isFinite(v)||v<=0))){
   setStatus('Provide the actual selling price for every available format.');return
  }
  setBusy(true);setStatus('')
  const {error}=await supabase.from('receptionist_inventory_formats').upsert({
   inventory_track_id:selected.id,audio_available:audio,video_available:video,
   audio_price:audio?a:null,video_price:video?v:null,
   verified_by:profile.id,verified_at:new Date().toISOString()
  },{onConflict:'inventory_track_id'})
  setBusy(false)
  if(error)setStatus(humanError(error))
  else{setStatus('Verified format availability is saved for Sarvam inventory lookup.');setConfirmed(false)}
 }
 if(profile?.role!=='founder')return null
 return <section className="ak-voice-section ak-voice-verify">
  <header className="ak-voice-section-heading"><div><h2><ListMusic size={19}/> Verify karaoke formats</h2>
   <p>AI only promises formats and prices you have verified.</p></div></header>
  <form onSubmit={lookup} className="ak-voice-verify-search">
   <label><Search size={16}/><input aria-label="Search catalog" placeholder="Malayalam, Manglish or English song…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <Button disabled={busy||query.trim().length<2} type="submit">Find song</Button>
  </form>
  {items.length>0&&<div className="ak-voice-verify-results">{items.map(track=>
   <button key={track.id} type="button" className={selected?.id===track.id?'selected':''} onClick={()=>void choose(track)}>
    <Music2 size={17}/><span>{track.track_name}<small>{track.language} · {track.english_title??track.malayalam_title??''}</small></span>
   </button>)}</div>}
  {selected&&<div className="ak-voice-verify-form">
   <h3>{selected.track_name} <small>({selected.language})</small></h3>
   <div className="ak-voice-review-fields">
    <label><span><input type="checkbox" checked={audio} onChange={e=>setAudio(e.target.checked)}/> Audio is available</span>
     <input inputMode="decimal" placeholder="Verified audio price ₹" disabled={!audio} value={audioPrice} onChange={e=>setAudioPrice(e.target.value)}/></label>
    <label><span><input type="checkbox" checked={video} onChange={e=>setVideo(e.target.checked)}/> Lyrics video is available</span>
     <input inputMode="decimal" placeholder="Verified video price ₹" disabled={!video} value={videoPrice} onChange={e=>setVideoPrice(e.target.value)}/></label>
   </div>
   <label className="ak-voice-ack"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    I checked the actual files, format, selling price, and permission to supply the track.</label>
   <Button disabled={busy||!confirmed} onClick={()=>void save()}>Save verified availability</Button>
   <p className="ak-voice-hint">Unchecked formats are explicitly marked unavailable. Ready-made audio order conversion needs further catalog support.</p>
  </div>}
  {status&&<p className="ak-voice-status" role="status">{status}</p>}
 </section>
}

/** Streaming playback requires an authenticated Supabase Edge Function, never the Sarvam key in the browser. */
export function PrivateCallRecording({callId,consent,reference}:{callId:string;consent:string;reference:string|null}){
 const [url,setUrl]=useState<string|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url])
 const listen=async()=>{
  setBusy(true);setMessage('')
  try{
   const {data,error}=await supabase.functions.invoke<Blob>('receptionist-recording',{body:{call_id:callId}})
   if(error)throw error
   if(!(data instanceof Blob)||!data.type.includes('audio/'))throw Error('Unexpected audio response')
   setUrl(URL.createObjectURL(data))
  }catch(error){setMessage(humanError(error))}
  finally{setBusy(false)}
 }
 if(consent!=='granted'||!reference)return <small>Recording playback unavailable without recorded consent.</small>
 return <div className="ak-voice-playback">
  {url?<audio controls preload="none" src={url}>Audio playback not supported.</audio>:
   <Button variant="secondary" icon={<LockKeyhole size={14}/>} disabled={busy} onClick={()=>void listen()}>
    {busy?'Loading…':'Load private recording'}
   </Button>}
  {message&&<small role="status">{message}</small>}
  <small><FileAudio size={12}/> Protected audio · retrieved only when requested</small>
 </div>
}
