import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

type PurgeRequest = {
  action: 'preview' | 'confirm'
  customerId: string
  confirmationName?: string
}

// The Edge Function uses dynamic PostgREST tables that are not backed by a
// generated Database type in this repository.
// deno-lint-ignore no-explicit-any
type AdminClient = any

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

async function removeProofs(admin: AdminClient, purgeId: string, paths: string[]) {
  if (!paths.length) return 'completed'
  let lastError = ''

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await admin.storage.from('payment-proofs').remove(paths)
    if (!error) {
      await admin.from('customer_privacy_purge_jobs').update({
        status: 'completed', proof_paths: [], attempts: attempt, last_error: null, updated_at: new Date().toISOString()
      }).eq('purge_id', purgeId)
      await admin.from('customer_privacy_purge_tombstones').update({ proof_cleanup_status: 'completed' }).eq('id', purgeId)
      return 'completed'
    }
    lastError = error.message
  }

  await admin.from('customer_privacy_purge_jobs').update({
    status: 'failed', attempts: 3, last_error: lastError, updated_at: new Date().toISOString()
  }).eq('purge_id', purgeId)
  await admin.from('customer_privacy_purge_tombstones').update({ proof_cleanup_status: 'failed' }).eq('id', purgeId)
  return 'failed'
}

async function retryPending(admin: AdminClient) {
  const { data } = await admin
    .from('customer_privacy_purge_jobs')
    .select('purge_id, proof_paths')
    .in('status', ['pending', 'failed'])
    .lt('attempts', 9)
    .limit(3)

  for (const job of (data ?? []) as Array<{ purge_id: string; proof_paths: string[] }>) {
    await removeProofs(admin, String(job.purge_id), Array.isArray(job.proof_paths) ? job.proof_paths : [])
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return response({ error: 'Authenticated Supabase configuration is required' }, 401)
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  })
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  try {
    const payload = await request.json() as PurgeRequest
    if (!payload.customerId || !['preview', 'confirm'].includes(payload.action)) {
      return response({ error: 'Invalid purge request' }, 400)
    }

    await retryPending(admin)

    if (payload.action === 'preview') {
      const { data, error } = await caller.rpc('preview_customer_privacy_purge', {
        p_customer_id: payload.customerId
      })
      if (error) throw error
      return response(data)
    }

    if (!payload.confirmationName) return response({ error: 'Confirmation name is required' }, 400)
    const { data, error } = await caller.rpc('confirm_customer_privacy_purge', {
      p_customer_id: payload.customerId,
      p_confirmation_name: payload.confirmationName
    })
    if (error) throw error

    const result = data as {
      purgeId: string
      affected: Record<string, number>
      retainedFinancialAmount: number
      proofPaths?: string[]
      proofCleanupStatus: string
    }
    const proofCleanupStatus = await removeProofs(admin, result.purgeId, result.proofPaths ?? [])
    return response({ ...result, proofPaths: undefined, proofCleanupStatus })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = /Founder permission|JWT|auth/i.test(message) ? 403 : /not found|already purged/i.test(message) ? 404 : 400
    return response({ error: message }, status)
  }
})
