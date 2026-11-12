// Authenticated Founder-only readiness report for the AKOCP receptionist.
// Reports yes/no configuration only. NEVER exposes any secret, token, or provider key.
import { createClient } from 'npm:@supabase/supabase-js@2.110.5'

const origins = new Set([
  'https://abzops.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])
const truthy = (value: string | undefined) => Boolean(value?.trim())
const tokenPresent = (value: string | undefined) => Boolean(value && value.length >= 32)
function headers(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  return {
    ...(origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '300',
    'Cache-Control': 'no-store, max-age=0',
    'Vary': 'Origin',
  }
}
function reply(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...headers(request), 'Content-Type': 'application/json' },
  })
}
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request) })
  if (request.method !== 'POST') return reply(request, { error: 'POST only' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const bearer = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1]
    if (!supabaseUrl || !publicKey || !serviceKey) return reply(request, { error: 'Backend unavailable' }, 503)
    if (!bearer) return reply(request, { error: 'Please sign in' }, 401)

    const publicClient = createClient(supabaseUrl, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await publicClient.auth.getUser(bearer)
    if (authError || !user) return reply(request, { error: 'Session invalid' }, 401)

    const serverClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: profile, error: profileError } = await serverClient
      .from('profiles').select('id,active,role').eq('id', user.id).maybeSingle()
    if (profileError || !profile?.active || profile.role !== 'founder') {
      return reply(request, { error: 'Founder access required' }, 403)
    }

    const [catalog, formats, inventory, lookup] = await Promise.all([
      serverClient.from('services').select('code,price,active').in('code', ['AU150', 'ML350', 'OL450']),
      serverClient.from('receptionist_inventory_formats').select('inventory_track_id', { head: true, count: 'exact' })
        .not('verified_at', 'is', null),
      serverClient.from('inventory_tracks').select('id', { head: true, count: 'exact' })
        .is('deleted_at', null),
      serverClient.rpc('receptionist_search_inventory', { p_query: 'malayalam', p_limit: 1 }),
    ])
    if (catalog.error || formats.error || inventory.error || lookup.error) {
      return reply(request, { error: 'Database readiness check failed' }, 503)
    }

    const prices = new Map((catalog.data ?? []).map(s => [s.code, { amount: Number(s.price), active: s.active }]))
    const validPrices = [
      ['AU150', 150], ['ML350', 350], ['OL450', 450],
    ].every(([code, amount]) => {
      const found = prices.get(String(code))
      return found?.active === true && found.amount === amount
    })

    const tool = Deno.env.get('AKOCP_VOICE_TOOL_TOKEN')
    const webhook = Deno.env.get('AKOCP_VOICE_WEBHOOK_TOKEN')
    const toolConfigured = tokenPresent(tool)
    const webhookConfigured = tokenPresent(webhook) && tool !== webhook
    const recordingConfigured = [
      'SARVAM_API_KEY', 'SARVAM_ORG_ID', 'SARVAM_WORKSPACE_ID', 'SARVAM_VOICE_APP_ID',
    ].every(key => truthy(Deno.env.get(key)))

    return reply(request, {
      backend: 'online',
      database: 'connected',
      catalog_prices_verified: validPrices,
      indexed_inventory_tracks: inventory.count ?? 0,
      verified_inventory_formats: formats.count ?? 0,
      tool_token_configured: toolConfigured,
      webhook_token_configured: webhookConfigured,
      recording_provider_configured: recordingConfigured,
      // Sarvam call routing and BSNL forwarding cannot be inferred from stored secrets.
      sarvam_phone_deployment: 'not_verified',
      bsnl_call_forwarding: 'not_verified',
      generated_at: new Date().toISOString(),
    })
  } catch {
    return reply(request, { error: 'Readiness check unavailable' }, 503)
  }
})
