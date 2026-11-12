// Authenticated, private WAV proxy for Sarvam Analytics recordings.
// Gateway JWT validation stays ENABLED. The Sarvam key is never sent to browsers.
import { createClient } from 'npm:@supabase/supabase-js@2.110.5'

const cors = {
 'access-control-allow-origin':'*',
 'access-control-allow-headers':'authorization, x-client-info, apikey, content-type',
 'access-control-allow-methods':'POST, OPTIONS'
}
function json(message:string,status:number) {
 return new Response(JSON.stringify({error:message}),{
  status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}
 })
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const safePart=/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
 if(request.method!=='POST')return json('Method not allowed',405)
 try {
  const authHeader=request.headers.get('authorization')??''
  if(!authHeader.startsWith('Bearer '))return json('Sign in to listen to a call',401)
  const token=authHeader.slice(7).trim()
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),
   role=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!url||!anon||!role)return json('Recording service is not configured',503)
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}})
  const result=await auth.auth.getUser(token)
  if(result.error||!result.data.user)return json('Session expired',401)
  const database=createClient(url,role,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:profile,error:profileError}=await database.from('profiles')
   .select('id,active,role').eq('id',result.data.user.id).single()
  if(profileError||!profile?.active||!['founder','operations'].includes(profile.role))
   return json('Workspace access required',403)
  const body=await request.text()
  if(body.length>2048)return json('Request too large',413)
  let parsed:unknown
  try{parsed=JSON.parse(body)}catch{return json('Invalid request',400)}
  const callId=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?
   (parsed as Record<string,unknown>).call_id:null
  if(typeof callId!=='string'||!uuid.test(callId))return json('Invalid call ID',400)
  const {data:call,error:callError}=await database.from('receptionist_calls')
   .select('interaction_id,recording_consent,recording_reference').eq('id',callId).single()
  if(callError||!call)return json('Recording unavailable',404)
  if(call.recording_consent!=='granted'||call.recording_reference!==call.interaction_id)
   return json('This recording is not available for playback',403)
  // Sarvam interaction_id must contain a date prefix and slash (e.g. 20261007/uuid).
  if(!/^[0-9]{8}\/[a-zA-Z0-9_-]{4,128}$/.test(call.interaction_id))
   return json('Recording reference is not valid',400)
  const org=Deno.env.get('SARVAM_ORG_ID')??''
  const workspace=Deno.env.get('SARVAM_WORKSPACE_ID')??''
  const app=Deno.env.get('SARVAM_VOICE_APP_ID')??''
  const key=Deno.env.get('SARVAM_API_KEY')??''
  if(![org,workspace,app].every(x=>safePart.test(x))||!key)
   return json('Sarvam recording access is not configured',503)
  const endpoint='https://apps.sarvam.ai/api/analytics/v1/'+
   [org,workspace,app,'recordings'].map(encodeURIComponent).join('/')+
   '/'+encodeURIComponent(call.interaction_id)
  const controller=new AbortController()
  const timeLimit=setTimeout(()=>controller.abort(),15000)
  let upstream:Response
  try {
   upstream=await fetch(endpoint,{method:'GET',headers:{'X-API-Key':key,'Accept':'audio/wav'},
    redirect:'error',signal:controller.signal})
  }finally {clearTimeout(timeLimit)}
  if(upstream.status===404)return json('Recording not found at Sarvam',404)
  if(!upstream.ok||!upstream.body)return json('Recording temporarily unavailable',502)
  if(!(upstream.headers.get('content-type')??'').toLowerCase().includes('audio/'))
   return json('Unexpected recording format',502)
  const size=Number(upstream.headers.get('content-length')??'0')
  if(size>50*1024*1024){await upstream.body.cancel();return json('Recording too large to stream',413)}
  return new Response(upstream.body,{
   status:200,headers:{...cors,
    'content-type':'audio/wav','content-disposition':'inline; filename="private-call.wav"',
    'cache-control':'private, no-store, max-age=0',
    'x-content-type-options':'nosniff'
   }
  })
 }catch {
  return json('Unable to retrieve this recording',503)
 }
})
