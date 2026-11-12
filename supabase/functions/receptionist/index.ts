// Supabase Edge Function for Sarvam Voice Agent. Secrets NEVER in frontend code.
// verify_jwt=false for this function only. Each request checks an independent token.
import { createClient } from 'npm:@supabase/supabase-js@2.110.5'

type Payload = Record<string, unknown>
type Format = 'audio' | 'video'
const respond = (data: unknown, status=200) => new Response(JSON.stringify(data), {
 status, headers:{'content-type':'application/json','cache-control':'no-store'}
})
const str=(value:unknown,max=200)=>typeof value==='string'?value.trim().slice(0,max):''
const safe=(value:unknown,max=200)=>str(value,max).replace(/[\u0000-\u001f]/g,' ')
const phone=(value:unknown)=>{
 const s=str(value,25), digits=s.replace(/\D/g,'')
 if(/^[6-9]\d{9}$/.test(digits))return '+91'+digits
 if(/^91[6-9]\d{9}$/.test(digits))return '+'+digits
 if(s.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits))return '+'+digits
 return null
}
const formatOf=(value:unknown):Format|null=>value==='audio'||value==='video'?value:null
function db() {
 const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 if(!url||!key)throw Error('Missing backend environment')
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
}
type DB=ReturnType<typeof db>
async function tokenOK(given:string, expected:string|undefined){
 if(!expected || expected.length<32 || !given || given.length>300)return false
 const enc=new TextEncoder()
 const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(given)),crypto.subtle.digest('SHA-256',enc.encode(expected))])
 const x=new Uint8Array(a), y=new Uint8Array(b)
 let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i]
 return diff===0
}
async function lookup(database:DB,body:Payload){
 const query=safe(body.query,100),format=formatOf(body.format)
 if(query.length<2||!format)return respond({error:'Song query and audio/video format required'},422)
 const {data,error}=await database.rpc('search_inventory',{
  p_query:query,p_language:null,p_sort:'orders',p_cursor_value:null,p_cursor_id:null,p_limit:6
 })
 if(error)throw error
 const matches=(data??[]) as Array<{id:string;track_name:string;english_title:string|null;malayalam_title:string|null;language:string}>
 if(!matches.length)return respond({status:'no_matches',instruction:'No search results. Ask film or singer; never claim definitely unavailable.'})
 const result=await database.from('receptionist_inventory_formats')
  .select('inventory_track_id,audio_available,video_available,audio_price,video_price,verified_at')
  .in('inventory_track_id',matches.map(x=>x.id))
 if(result.error)throw result.error
 const formats=new Map((result.data??[]).map(x=>[x.inventory_track_id,x]))
 return respond({status:'candidate_matches',matches:matches.map(x=>{
  const v=formats.get(x.id)
  const available=format==='audio'?v?.audio_available:v?.video_available
  const price=Number(format==='audio'?v?.audio_price:v?.video_price)
  const status=!v?.verified_at?'not_verified':!available?'not_available':price>0?'available':'needs_price_review'
  return {inventory_track_id:x.id,title:x.track_name,title_alternatives:[x.english_title,x.malayalam_title].filter(Boolean),
   language:x.language,format,availability:status,confirmed_price_inr:status==='available'?price:null}
 }),instruction:'Confirm the exact title and format. Do not invent availability or use an unverified price.'})
}
const PRICE={AU150:150,ML350:350,OL450:450} as const
type Code=keyof typeof PRICE
function priceCode(format:Format,language:string):Code|null{
 if(format==='audio')return 'AU150'
 const name=language.trim().toLowerCase()
 if(!name||['unknown','other','unverified'].includes(name))return null
 return ['malayalam','മലയാളം','ml','ml-in'].includes(name)?'ML350':'OL450'
}
async function quote(database:DB,format:Format,language:string){
 const code=priceCode(format,language)
 if(!code)return {status:'needs_language',message:'Ask song language; video quote cannot be final without verification.'}
 const {data,error}=await database.from('services').select('code,price,active').eq('code',code).maybeSingle()
 if(error)throw error
 if(!data?.active||Number(data.price)!==PRICE[code])return {status:'manual_review',message:'Configured business price differs. Owner must verify.'}
 return {status:'quoted',code,amount_inr:PRICE[code],provisional:format==='video',message:format==='video'?'Verify song language before taking a final order.':'All languages audio rate.'}
}
async function capture(database:DB,body:Payload){
 const interaction=str(body.interaction_id,160),caller=phone(body.user_phone_number)
 const item=Number(body.item_number),song=safe(body.song_title,200),format=formatOf(body.format)
 const language=safe(body.song_language,60),customer=safe(body.customer_name,100),whatsapp=phone(body.whatsapp_phone)
 const approved=body.caller_approved===true,utterance=approved?safe(body.approval_utterance,400):''
 if(interaction.length<4||!caller||!Number.isInteger(item)||item<1||item>20||song.length<2||!format)
  return respond({error:'Invalid caller, song, item number or format'},422)
 if(approved&&utterance.length<2)return respond({error:'Verbatim caller approval required'},422)
 let trackId:null|string=null,stock:'not_verified'|'available'|'not_available'='not_verified'
 let amount:null|number=null,quoteStatus:'pending'|'provisional'|'verified'='pending'
 const candidate=str(body.inventory_track_id,40)
 if(/^[0-9a-f-]{36}$/i.test(candidate)){
  const track=await database.from('inventory_tracks').select('id,language').eq('id',candidate).is('deleted_at',null).maybeSingle()
  if(track.error)throw track.error
  if(track.data){
   trackId=track.data.id
   const v=await database.from('receptionist_inventory_formats')
    .select('audio_available,video_available,audio_price,video_price,verified_at').eq('inventory_track_id',trackId).maybeSingle()
   if(v.error)throw v.error
   if(v.data?.verified_at){
    const available=format==='audio'?v.data.audio_available:v.data.video_available
    stock=available?'available':'not_available'
    const ready=Number(format==='audio'?v.data.audio_price:v.data.video_price)
    if(available&&ready>0){amount=ready;quoteStatus='verified'}
   }
  }
 }
 if(stock!=='available'){
  const custom=await quote(database,format,language)
  if(custom.status==='quoted'){amount=custom.amount_inr;quoteStatus=custom.provisional?'provisional':'verified'}
 }
 const call=await database.from('receptionist_calls')
  .upsert({interaction_id:interaction,caller_phone:caller},{onConflict:'interaction_id'}).select('id').single()
 if(call.error||!call.data)throw call.error??Error('Call save failed')
 const record={call_id:call.data.id,item_number:item,customer_name:customer||null,
  song_title:song,song_language:language||null,
  language_status:trackId&&stock!=='not_verified'?'verified_inventory':language?'reported_by_caller':'unverified',
  karaoke_format:format,inventory_track_id:trackId,stock_status:stock,
  quote_amount:amount,quote_status:quoteStatus,caller_approved:approved,approval_utterance:utterance||null,
  whatsapp_phone:whatsapp,whatsapp_confirmed_by_caller:body.whatsapp_confirmed_by_caller===true&&Boolean(whatsapp)}
 const res=await database.from('receptionist_requests').insert(record).select('id').maybeSingle()
 if(res.error?.code==='23505'){
  const existing=await database.from('receptionist_requests').select('id').eq('call_id',call.data.id).eq('item_number',item).maybeSingle()
  return respond({status:'already_captured',request_id:existing.data?.id??null})
 }
 if(res.error)throw res.error
 return respond({status:'queued_for_owner_review',request_id:res.data?.id??null,caller_approved:approved,
  quote_amount_inr:amount,quote_status:quoteStatus,
  message:'Lead saved, not a financially confirmed order. Owner will review.'})
}
async function ended(database:DB,body:Payload){
 const interaction=str(body.interaction_id,160),caller=phone(body.user_phone_number)
 if(interaction.length<4||!caller)return respond({error:'Invalid call-end event'},422)
 const vars=body.agent_variables&&typeof body.agent_variables==='object'?body.agent_variables as Payload:{}
 const choice=vars.recording_consent
 const consent=choice===true||choice==='yes'||choice==='granted'?'granted':
  choice===false||choice==='no'||choice==='declined'?'declined':'unknown'
 const numeric=Number(body.duration)
 const duration=Number.isFinite(numeric)?Math.max(0,Math.min(7200,Math.trunc(numeric))):0
 const transcript=consent==='granted'&&typeof body.transcript==='string'?safe(body.transcript,30000):null
 const result=await database.from('receptionist_calls').upsert({
  interaction_id:interaction,caller_phone:caller,agent_phone:phone(body.agent_phone_number),
  duration_seconds:duration,end_reason:safe(body.end_reason,100)||null,
  recording_consent:consent,transcript,recording_reference:consent==='granted'?interaction:null,
  updated_at:new Date().toISOString()
 },{onConflict:'interaction_id'})
 if(result.error)throw result.error
 return respond({accepted:true})
}
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return respond({error:'POST required'},405)
 const url=new URL(request.url),isWebhook=url.searchParams.has('webhook_token')
 const supplied=isWebhook?(url.searchParams.get('webhook_token')??''):
  (request.headers.get('authorization')??'').replace(/^Bearer\s+/i,'')
 const configured=Deno.env.get(isWebhook?'AKOCP_VOICE_WEBHOOK_TOKEN':'AKOCP_VOICE_TOOL_TOKEN')
 if(!await tokenOK(supplied,configured))return respond({error:'Unauthorized'},401)
 try{
  const raw=await request.text()
  if(new TextEncoder().encode(raw).byteLength>128000)return respond({error:'Payload too large'},413)
  const value:unknown=JSON.parse(raw)
  if(!value||typeof value!=='object'||Array.isArray(value))return respond({error:'Invalid JSON object'},422)
  const body=value as Payload,database=db()
  if(isWebhook)return await ended(database,body)
  if(body.action==='lookup')return await lookup(database,body)
  if(body.action==='quote'){
   const format=formatOf(body.format)
   return format?respond(await quote(database,format,str(body.song_language,60))):respond({error:'Invalid format'},422)
  }
  if(body.action==='capture')return await capture(database,body)
  return respond({error:'Unknown action'},422)
 }catch{
  // Do not leak phone numbers, API keys, transcript or credentialed endpoint URLs.
  return respond({error:'Unable to complete request; request a human callback.'},503)
 }
})
