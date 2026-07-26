import {
  AlertTriangle,
  Bot,
  Check,
  ChevronLeft,
  Clock3,
  History,
  LoaderCircle,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { aiService, proposalStaleReason } from '../lib/ai-service'
import { formatCurrency, fromNow, humanize } from '../lib/format'
import type {
  AiActionProposal,
  AiConversation,
  AiMessage,
  AiSettings,
  AiUsage,
  CreateTrackInput,
  ExpenseCategory,
  OrderStatus,
  Role,
  WithdrawalReason
} from '../types'
import { Badge, Button, ConfirmDialog, IconButton, cn } from './ui'

const starters = [
  'What work needs attention today?',
  'Show confirmed finance and legacy quoted totals for this month.',
  'ഈ ആഴ്ച pending orders ഏതൊക്കെയാണ്?',
  'Find duplicate inventory tracks for me.'
]

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function proposalTitle(proposal: AiActionProposal) {
  const titles: Record<AiActionProposal['action_type'], string> = {
    create_order: 'Create order',
    update_order_status: 'Update order status',
    open_payment_proof: 'Open payment-proof form',
    confirm_payment: 'Confirm payment',
    complete_order: 'Complete order',
    deliver_order: 'Deliver order',
    create_inventory_track: 'Add inventory track',
    update_customer: 'Update customer',
    create_expense: 'Record expense',
    request_withdrawal: 'Request withdrawal',
    review_withdrawal: 'Review withdrawal',
    update_service: 'Update service',
    update_team_role: 'Update team role'
  }
  return titles[proposal.action_type]
}

export function CopilotDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const { profile } = useAuth()
  const { snapshot, service, refresh, showToast } = useAppData()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [proposals, setProposals] = useState<AiActionProposal[]>([])
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [auditAll, setAuditAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<AiActionProposal | null>(null)
  const [busyProposal, setBusyProposal] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const reloadConversations = useCallback(async (all = auditAll) => {
    if (!profile) return
    const rows = await aiService.listConversations(profile.id, profile.role === 'founder' && all)
    setConversations(rows)
  }, [auditAll, profile])

  const loadConversation = useCallback(async (id: string) => {
    setLoadingHistory(true)
    setError(null)
    try {
      const content = await aiService.getConversation(id)
      setConversationId(id)
      setMessages(content.messages)
      setProposals(content.proposals)
      setHistoryOpen(false)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this conversation.')
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !profile) return
    document.body.classList.add('copilot-open')
    let active = true
    const load = async () => {
      setLoadingHistory(true)
      try {
        const [nextSettings, nextUsage, nextConversations] = await Promise.all([
          aiService.getSettings(),
          aiService.getUsage(profile.id),
          aiService.listConversations(profile.id, false)
        ])
        if (!active) return
        setSettings(nextSettings)
        setUsage(nextUsage)
        setConversations(nextConversations)
        if (!conversationId && nextConversations[0]) await loadConversation(nextConversations[0].id)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'The copilot database is not ready.')
      } finally {
        if (active) setLoadingHistory(false)
      }
    }
    void load()
    return () => {
      active = false
      document.body.classList.remove('copilot-open')
    }
  }, [conversationId, loadConversation, open, profile])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [loading, messages, proposals])

  const newConversation = () => {
    setConversationId(null)
    setMessages([])
    setProposals([])
    setInput('')
    setError(null)
    setHistoryOpen(false)
  }

  const sendMessage = async (text = input) => {
    const clean = text.trim()
    if (!clean || loading || !profile) return
    setInput('')
    setError(null)
    setLoading(true)
    setMessages((current) => [...current, {
      id: `local-${crypto.randomUUID()}`,
      conversation_id: conversationId ?? 'new',
      sender: 'user',
      content: clean,
      created_at: new Date().toISOString()
    }])
    try {
      const response = await aiService.sendMessage(conversationId, clean)
      setConversationId(response.conversationId)
      setUsage(response.usage)
      const content = await aiService.getConversation(response.conversationId)
      setMessages(content.messages)
      setProposals(content.proposals)
      await reloadConversations(false)
    } catch (sendError) {
      setMessages((current) => current.filter((item) => !item.id.startsWith('local-')))
      setError(sendError instanceof Error ? sendError.message : 'The copilot could not answer.')
    } finally {
      setLoading(false)
    }
  }

  const deleteConversation = async (conversation: AiConversation) => {
    if (!window.confirm(`Permanently delete "${conversation.title}"? Messages and proposals cannot be recovered.`)) return
    try {
      await aiService.deleteConversation(conversation.id)
      if (conversation.id === conversationId) newConversation()
      await reloadConversations()
      showToast({ type: 'success', title: 'Conversation permanently deleted' })
    } catch (deleteError) {
      showToast({ type: 'error', title: 'Could not delete conversation', message: deleteError instanceof Error ? deleteError.message : undefined })
    }
  }

  const refreshConversation = async () => {
    if (!conversationId) return
    const content = await aiService.getConversation(conversationId)
    setMessages(content.messages)
    setProposals(content.proposals)
  }

  const executeProposal = async (proposal: AiActionProposal) => {
    if (!profile || !snapshot) return
    const stale = proposalStaleReason(proposal, snapshot)
    if (stale) {
      showToast({ type: 'error', title: 'Proposal cannot be confirmed', message: stale })
      return
    }

    setBusyProposal(proposal.id)
    try {
      await aiService.claimProposal(proposal.id)
      const payload = proposal.payload
      switch (proposal.action_type) {
        case 'create_order':
          await service.createOrder({
            customerName: String(payload.customerName),
            phone: String(payload.phone),
            whatsapp: payload.whatsapp ? String(payload.whatsapp) : undefined,
            customerNotes: payload.customerNotes ? String(payload.customerNotes) : undefined,
            serviceId: String(payload.serviceId),
            inventoryTrackId: payload.inventoryTrackId ? String(payload.inventoryTrackId) : undefined,
            trackName: String(payload.trackName),
            language: String(payload.language),
            dueDate: payload.dueDate ? String(payload.dueDate) : undefined,
            assignedTo: payload.assignedTo ? String(payload.assignedTo) : undefined,
            notes: payload.notes ? String(payload.notes) : undefined
          }, profile)
          break
        case 'update_order_status':
          await service.updateOrderStatus(String(payload.orderId), String(payload.status) as OrderStatus, profile)
          break
        case 'confirm_payment':
          await service.confirmPayment(String(payload.paymentId), profile)
          break
        case 'complete_order': {
          const order = snapshot.orders.find((item) => item.id === payload.orderId)
          if (!order) throw new Error('Order is no longer available')
          const add = payload.addToInventory === true
          const trackInput: CreateTrackInput | null = add ? {
            trackName: order.track_name,
            language: order.language,
            englishTitle: payload.englishTitle ? String(payload.englishTitle) : undefined,
            malayalamTitle: payload.malayalamTitle ? String(payload.malayalamTitle) : undefined,
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
            filePath: payload.filePath ? String(payload.filePath) : undefined,
            createdFromOrderId: order.id
          } : null
          await service.completeOrder(order.id, add, trackInput, profile)
          break
        }
        case 'deliver_order':
          await service.updateOrderStatus(String(payload.orderId), 'delivered', profile)
          break
        case 'create_inventory_track':
          await service.createTrack({
            trackName: String(payload.trackName),
            language: String(payload.language),
            englishTitle: payload.englishTitle ? String(payload.englishTitle) : undefined,
            malayalamTitle: payload.malayalamTitle ? String(payload.malayalamTitle) : undefined,
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
            filePath: payload.filePath ? String(payload.filePath) : undefined
          }, profile)
          break
        case 'update_customer':
          await service.updateCustomer(String(payload.customerId), {
            name: String(payload.name),
            whatsapp: payload.whatsapp ? String(payload.whatsapp) : null,
            notes: payload.notes ? String(payload.notes) : null
          }, profile)
          break
        case 'create_expense':
          await service.createExpense({
            amount: Number(payload.amount),
            category: String(payload.category) as ExpenseCategory,
            description: String(payload.description),
            expenseDate: String(payload.expenseDate),
            file: null
          }, profile)
          break
        case 'request_withdrawal':
          await service.requestWithdrawal({
            amount: Number(payload.amount),
            reason: String(payload.reason) as WithdrawalReason,
            notes: payload.notes ? String(payload.notes) : undefined
          }, profile)
          break
        case 'review_withdrawal':
          await service.reviewWithdrawal(String(payload.withdrawalId), String(payload.decision) as 'approved' | 'rejected', profile)
          break
        case 'update_service':
          await service.updateService(String(payload.serviceId), {
            name: String(payload.name),
            price: Number(payload.price),
            active: payload.active === true
          }, profile)
          break
        case 'update_team_role':
          await service.updateProfileRole(String(payload.profileId), String(payload.role) as Role, profile)
          break
        case 'open_payment_proof':
          throw new Error('Use Review form to select the payment proof manually')
      }
      await aiService.finishProposal(proposal.id, true, { completedAt: new Date().toISOString() })
      await refresh()
      await refreshConversation()
      showToast({ type: 'success', title: `${proposalTitle(proposal)} completed` })
    } catch (actionError) {
      try {
        await aiService.finishProposal(proposal.id, false, {
          failedAt: new Date().toISOString(),
          error: actionError instanceof Error ? actionError.message : 'Action failed'
        })
      } catch {
        // The claim itself may have failed, so no executing proposal exists to finish.
      }
      await refreshConversation()
      showToast({ type: 'error', title: 'Confirmed action failed', message: actionError instanceof Error ? actionError.message : undefined })
    } finally {
      setBusyProposal(null)
      setConfirming(null)
    }
  }

  const reviewPayment = (proposal: AiActionProposal) => {
    const stale = proposalStaleReason(proposal, snapshot)
    if (stale) {
      showToast({ type: 'error', title: 'Proposal cannot be reviewed', message: stale })
      return
    }
    sessionStorage.setItem('akocp-ai-payment', JSON.stringify({
      proposalId: proposal.id,
      orderId: proposal.payload.orderId,
      amount: proposal.payload.amount,
      upiReference: proposal.payload.upiReference ?? ''
    }))
    onClose()
    navigate('/orders?aiPayment=1')
  }

  const cancelProposal = async (proposal: AiActionProposal) => {
    setBusyProposal(proposal.id)
    try {
      await aiService.cancelProposal(proposal.id)
      await refreshConversation()
    } catch (cancelError) {
      showToast({ type: 'error', title: 'Could not cancel proposal', message: cancelError instanceof Error ? cancelError.message : undefined })
    } finally {
      setBusyProposal(null)
    }
  }

  const visibleProposals = useMemo(
    () => proposals.filter((proposal) => !['cancelled'].includes(proposal.status)),
    [proposals]
  )

  if (!open || !profile) return null
  return (
    <div className="copilot-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="copilot-drawer" role="dialog" aria-modal="true" aria-label="AK OCP AI copilot">
        <aside className={cn('copilot-history', historyOpen && 'open')}>
          <div className="copilot-history-head">
            <strong><History size={16} /> Conversations</strong>
            <IconButton label="Close history" onClick={() => setHistoryOpen(false)}><ChevronLeft size={18} /></IconButton>
          </div>
          <Button className="copilot-new" variant="secondary" icon={<MessageSquarePlus size={16} />} onClick={newConversation}>New chat</Button>
          {profile.role === 'founder' && (
            <label className="copilot-audit-toggle">
              <input type="checkbox" checked={auditAll} onChange={async (event) => {
                const checked = event.target.checked
                setAuditAll(checked)
                try {
                  const rows = await aiService.listConversations(profile.id, checked)
                  setConversations(rows)
                } catch (auditError) {
                  setError(auditError instanceof Error ? auditError.message : 'Could not load audit conversations.')
                }
              }} />
              <span>Founder audit view</span>
            </label>
          )}
          <div className="copilot-history-list">
            {conversations.map((conversation) => (
              <div key={conversation.id} className={cn(conversation.id === conversationId && 'active')}>
                <button onClick={() => void loadConversation(conversation.id)}>
                  <strong>{conversation.title}</strong>
                  <span>{conversation.owner?.full_name && auditAll ? `${conversation.owner.full_name} · ` : ''}{fromNow(conversation.updated_at)}</span>
                </button>
                <IconButton label="Delete conversation" onClick={() => void deleteConversation(conversation)}><Trash2 size={14} /></IconButton>
              </div>
            ))}
            {!conversations.length && <p>No saved conversations yet.</p>}
          </div>
          <div className="copilot-privacy">
            <ShieldCheck size={16} />
            <span>Chats stay in Supabase until you or a Founder deletes them.</span>
          </div>
        </aside>

        <div className="copilot-main">
          <header className="copilot-header">
            <IconButton label="Show history" className="copilot-history-button" onClick={() => setHistoryOpen(true)}><History size={18} /></IconButton>
            <span className="copilot-logo"><Sparkles size={18} /></span>
            <div><strong>Operations Copilot</strong><small>{settings?.enabled ? `${usage?.remaining ?? '—'} prompts left today` : 'Disabled by Founder'}</small></div>
            {settings && <Badge tone={settings.provider_status === 'available' ? 'green' : settings.provider_status === 'degraded' ? 'yellow' : 'neutral'}>{humanize(settings.provider_status)}</Badge>}
            <IconButton label="Close copilot" onClick={onClose}><X size={20} /></IconButton>
          </header>

          <div className="copilot-feed">
            {loadingHistory && !messages.length ? <div className="copilot-loading"><LoaderCircle className="animate-spin" size={23} /> Loading secure history…</div>
              : !messages.length ? (
                <div className="copilot-welcome">
                  <span><Bot size={28} /></span>
                  <h2>Ask about operations</h2>
                  <p>Read live business data, inspect the supplied legacy notes, or prepare a controlled change. Nothing changes until you confirm.</p>
                  <div>{starters.map((starter) => <button key={starter} onClick={() => void sendMessage(starter)}>{starter}</button>)}</div>
                </div>
              ) : (
                <div className="copilot-messages">
                  {messages.map((message) => (
                    <article key={message.id} className={cn('copilot-message', message.sender)}>
                      <span>{message.sender === 'assistant' ? <Sparkles size={15} /> : profile.full_name.charAt(0).toUpperCase()}</span>
                      <div><p>{message.content}</p><small>{fromNow(message.created_at)}{message.model ? ` · ${message.model}` : ''}</small></div>
                    </article>
                  ))}
                  {visibleProposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      staleReason={proposalStaleReason(proposal, snapshot)}
                      busy={busyProposal === proposal.id}
                      onConfirm={() => setConfirming(proposal)}
                      onReview={() => reviewPayment(proposal)}
                      onCancel={() => void cancelProposal(proposal)}
                    />
                  ))}
                  {loading && <article className="copilot-message assistant thinking"><span><Sparkles size={15} /></span><div><LoaderCircle className="animate-spin" size={17} /><p>Checking the permitted records…</p></div></article>}
                </div>
              )}
            {error && <div className="copilot-error"><AlertTriangle size={17} /><span>{error}</span></div>}
            <div ref={endRef} />
          </div>

          <footer className="copilot-composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage()
                }
              }}
              disabled={loading || !settings?.enabled}
              rows={2}
              maxLength={4000}
              placeholder={settings?.enabled ? 'Ask in English, Malayalam, or Manglish…' : 'Enable the copilot in Founder settings first.'}
            />
            <IconButton label="Send message" disabled={loading || !input.trim() || !settings?.enabled} onClick={() => void sendMessage()}><Send size={18} /></IconButton>
            <small>AI can make mistakes. Verify business details before confirming.</small>
          </footer>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && void executeProposal(confirming)}
        title={`Confirm ${confirming ? proposalTitle(confirming).toLowerCase() : 'change'}?`}
        message="This will execute the exact proposal through AK OCP’s existing permission checks and business invariants. It cannot be reused."
        confirmLabel="Confirm & execute"
        danger={confirming?.risk_level === 'critical'}
        loading={Boolean(confirming && busyProposal === confirming.id)}
      />
    </div>
  )
}

function ProposalCard({
  proposal,
  staleReason,
  busy,
  onConfirm,
  onReview,
  onCancel
}: {
  proposal: AiActionProposal
  staleReason: string | null
  busy: boolean
  onConfirm(): void
  onReview(): void
  onCancel(): void
}) {
  const pending = proposal.status === 'pending'
  const reviewOnly = proposal.action_type === 'open_payment_proof'
  const expires = Math.max(0, Math.ceil((new Date(proposal.expires_at).getTime() - Date.now()) / 60000))
  return (
    <article className={cn('proposal-card', `risk-${proposal.risk_level}`, !pending && 'resolved')}>
      <div className="proposal-head">
        <span><ShieldCheck size={17} /></span>
        <div><strong>{proposalTitle(proposal)}</strong><small>{humanize(proposal.risk_level)} risk · {pending ? `expires in ${expires} min` : humanize(proposal.status)}</small></div>
        <Badge tone={proposal.status === 'confirmed' ? 'green' : proposal.status === 'failed' || staleReason ? 'red' : proposal.risk_level === 'critical' ? 'red' : 'yellow'}>{humanize(proposal.status)}</Badge>
      </div>
      <dl>
        {Object.entries(proposal.payload).map(([key, value]) => (
          <div key={key}><dt>{humanize(key)}</dt><dd>{key.toLowerCase().includes('amount') || key === 'price' ? formatCurrency(Number(value)) : valueLabel(value)}</dd></div>
        ))}
      </dl>
      {staleReason && pending && <p className="proposal-warning"><Clock3 size={14} /> {staleReason}</p>}
      {pending && !staleReason && (
        <div className="proposal-actions">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>Dismiss</Button>
          <Button loading={busy} icon={reviewOnly ? <ChevronLeft size={15} /> : <Check size={15} />} onClick={reviewOnly ? onReview : onConfirm}>{reviewOnly ? 'Review form' : 'Confirm'}</Button>
        </div>
      )}
    </article>
  )
}

