import type {
  AiActionProposal,
  AiConversation,
  AiCopilotResponse,
  AiMessage,
  AiSettings,
  AiUsage,
  AppSnapshot
} from '../types'
import { normalizeSupabaseError, supabase } from './supabase'

function assertNoError(error: unknown) {
  if (error) throw normalizeSupabaseError(error)
}

async function functionError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context) {
      // SDK older path: context is a raw Response object
      if (typeof (context as Response).clone === 'function') {
        try {
          const body = await (context as Response).clone().json() as { error?: string; message?: string }
          const msg = body.error || body.message
          if (msg) return new Error(msg)
        } catch { /* fall through */ }
      }
      // SDK newer path: context is already a parsed object
      if (typeof context === 'object' && context !== null) {
        const body = context as { error?: string; message?: string }
        const msg = body.error || body.message
        if (msg) return new Error(msg)
      }
    }
  }
  // Last resort: read message directly from the error object
  if (typeof error === 'object' && error !== null) {
    const value = error as { message?: string }
    if (value.message && value.message !== 'Edge Function returned a non-2xx status code') {
      return new Error(value.message)
    }
  }
  return normalizeSupabaseError(error)
}

export const aiService = {
  async getSettings() {
    const { data, error } = await supabase.from('ai_settings').select('*').eq('id', 1).single()
    assertNoError(error)
    return data as AiSettings
  },

  async updateSettings(settings: Pick<AiSettings, 'enabled' | 'primary_model' | 'fallback_model' | 'daily_request_limit' | 'max_output_tokens'>) {
    const { data, error } = await supabase.rpc('update_ai_settings', {
      p_enabled: settings.enabled,
      p_primary_model: settings.primary_model,
      p_fallback_model: settings.fallback_model,
      p_daily_request_limit: settings.daily_request_limit,
      p_max_output_tokens: settings.max_output_tokens
    })
    assertNoError(error)
    return data as AiSettings
  },

  async listConversations(userId: string, auditAll = false) {
    let query = supabase
      .from('ai_conversations')
      .select('*, owner:profiles!ai_conversations_owner_id_fkey(id,full_name,email)')
      .order('updated_at', { ascending: false })
      .limit(100)
    if (!auditAll) query = query.eq('owner_id', userId)
    const { data, error } = await query
    assertNoError(error)
    return (data ?? []) as unknown as AiConversation[]
  },

  async getConversation(conversationId: string) {
    const [messages, proposals] = await Promise.all([
      supabase.from('ai_messages').select('*').eq('conversation_id', conversationId).order('created_at'),
      supabase.from('ai_action_proposals').select('*').eq('conversation_id', conversationId).order('created_at')
    ])
    assertNoError(messages.error)
    assertNoError(proposals.error)
    return {
      messages: (messages.data ?? []) as AiMessage[],
      proposals: (proposals.data ?? []) as AiActionProposal[]
    }
  },

  async getUsage(userId: string) {
    const today = new Date().toISOString().slice(0, 10)
    const [{ data: usage, error }, settings] = await Promise.all([
      supabase.from('ai_usage_daily').select('*').eq('user_id', userId).eq('usage_date', today).maybeSingle(),
      this.getSettings()
    ])
    assertNoError(error)
    return {
      requestCount: usage?.request_count ?? 0,
      dailyLimit: settings.daily_request_limit,
      remaining: Math.max(settings.daily_request_limit - (usage?.request_count ?? 0), 0),
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0
    } as AiUsage
  },

  async sendMessage(conversationId: string | null, message: string) {
    const { data, error } = await supabase.functions.invoke('ai-copilot', {
      body: { conversationId: conversationId || undefined, message }
    })
    if (error) throw await functionError(error)
    return data as AiCopilotResponse
  },

  async checkProviderHealth() {
    const { data, error } = await supabase.functions.invoke('ai-copilot', {
      body: { action: 'health_check' }
    })
    if (error) throw await functionError(error)
    return data as { provider_status: string }
  },

  async deleteConversation(conversationId: string) {
    const { error } = await supabase.rpc('delete_ai_conversation', { p_conversation_id: conversationId })
    assertNoError(error)
  },

  async claimProposal(proposalId: string) {
    const { data, error } = await supabase.rpc('claim_ai_action_proposal', { p_proposal_id: proposalId })
    assertNoError(error)
    const proposal = data as AiActionProposal
    if (proposal.status !== 'executing') throw new Error('Proposal expired; ask the copilot to create a new one')
    return proposal
  },

  async finishProposal(proposalId: string, success: boolean, result: Record<string, unknown>) {
    const { error } = await supabase.rpc('finish_ai_action_proposal', {
      p_proposal_id: proposalId,
      p_success: success,
      p_result: result
    })
    assertNoError(error)
  },

  async cancelProposal(proposalId: string) {
    const { error } = await supabase.rpc('cancel_ai_action_proposal', { p_proposal_id: proposalId })
    assertNoError(error)
  }
}

export function proposalStaleReason(proposal: AiActionProposal, snapshot: AppSnapshot | null, now = Date.now()) {
  if (proposal.status !== 'pending') return `This proposal is already ${proposal.status}.`
  if (new Date(proposal.expires_at).getTime() <= now) return 'This proposal has expired. Ask the copilot to prepare a new one.'
  if (!snapshot) return 'Current business data is unavailable.'

  const expected = proposal.preconditions
  const compare = (
    label: string,
    current: Record<string, unknown> | undefined,
    fields: string[]
  ) => {
    const previous = expected[label]
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return null
    if (!current) return `The referenced ${label} is no longer available.`
    const stale = fields.some((field) => {
      const before = (previous as Record<string, unknown>)[field]
      return before !== undefined && before !== current[field]
    })
    return stale ? `The ${label} changed after this proposal was prepared.` : null
  }

  const orderId = String(proposal.payload.orderId ?? '')
  const paymentId = String(proposal.payload.paymentId ?? '')
  const customerId = String(proposal.payload.customerId ?? '')
  const withdrawalId = String(proposal.payload.withdrawalId ?? '')
  const serviceId = String(proposal.payload.serviceId ?? '')
  const profileId = String(proposal.payload.profileId ?? '')

  return compare('order', snapshot.orders.find((item) => item.id === orderId) as unknown as Record<string, unknown>, ['status', 'payment_status', 'updated_at'])
    || compare('payment', snapshot.payments.find((item) => item.id === paymentId) as unknown as Record<string, unknown>, ['status', 'amount'])
    || compare('customer', snapshot.customers.find((item) => item.id === customerId) as unknown as Record<string, unknown>, ['name', 'whatsapp', 'notes', 'updated_at'])
    || compare('withdrawal', snapshot.withdrawals.find((item) => item.id === withdrawalId) as unknown as Record<string, unknown>, ['status', 'amount'])
    || compare('service', snapshot.services.find((item) => item.id === serviceId) as unknown as Record<string, unknown>, ['name', 'price', 'active', 'updated_at'])
    || compare('profile', snapshot.profiles.find((item) => item.id === profileId) as unknown as Record<string, unknown>, ['role', 'active'])
}
