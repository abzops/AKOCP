import { BadgeIndianRupee, Bot, CheckCircle2, Cloud, Database, Edit3, FileClock, KeyRound, LockKeyhole, Radio, ShieldCheck, UserCog, UsersRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Badge, Button, Card, ConfirmDialog, Input, Modal, PageHeader, Select, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useAppData } from '../context/AppDataContext'
import { aiService } from '../lib/ai-service'
import { formatCurrency, formatDate, humanize, initials } from '../lib/format'
import type { AiSettings, Profile, Role, Service } from '../types'

type SettingsTab = 'services' | 'team' | 'ai' | 'audit' | 'system'

export function SettingsPage() {
  const { snapshot } = useAppData()
  const [tab, setTab] = useState<SettingsTab>('services')
  if (!snapshot) return null
  return (
    <div className="page-stack settings-page">
      <PageHeader eyebrow="Founder controls" title="System settings" description="Manage controlled pricing, access roles, audit history, and application status." />
      <div className="settings-layout">
        <Card className="settings-nav">{(['services', 'team', 'ai', 'audit', 'system'] as SettingsTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'services' ? <BadgeIndianRupee size={18} /> : item === 'team' ? <UsersRound size={18} /> : item === 'ai' ? <Bot size={18} /> : item === 'audit' ? <FileClock size={18} /> : <Database size={18} />}<span>{item === 'audit' ? 'Audit log' : item === 'ai' ? 'AI copilot' : item.charAt(0).toUpperCase() + item.slice(1)}</span></button>)}</Card>
        <div className="settings-content">{tab === 'services' && <ServicesSettings />}{tab === 'team' && <TeamSettings />}{tab === 'ai' && <AiSettingsPanel />}{tab === 'audit' && <AuditSettings />}{tab === 'system' && <SystemSettings />}</div>
      </div>
    </div>
  )
}

function AiSettingsPanel() {
  const { showToast } = useAppData()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    aiService.getSettings()
      .then((value) => active && setSettings(value))
      .catch((error) => active && showToast({ type: 'error', title: 'AI settings unavailable', message: error instanceof Error ? error.message : undefined }))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [showToast])
  if (loading) return <Card className="settings-panel ai-settings-panel"><div className="settings-heading"><span><Bot size={21} /></span><div><h2>Operations copilot</h2><p>Loading secure provider controls…</p></div></div></Card>
  if (!settings) return <Card className="settings-panel ai-settings-panel"><div className="settings-heading"><span><Bot size={21} /></span><div><h2>Operations copilot</h2><p>Apply the latest Supabase schema to configure AI.</p></div></div></Card>

  const update = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => setSettings((current) => current ? { ...current, [key]: value } : current)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const next = await aiService.updateSettings(settings)
      setSettings(next)
      showToast({ type: 'success', title: next.enabled ? 'Operations copilot enabled' : 'Operations copilot disabled' })
    } catch (error) {
      showToast({ type: 'error', title: 'Could not save AI settings', message: error instanceof Error ? error.message : undefined })
    } finally {
      setSaving(false)
    }
  }
  return <Card className="settings-panel ai-settings-panel">
    <div className="settings-heading"><span><Bot size={21} /></span><div><h2>Operations copilot</h2><p>Groq runs in a protected Edge Function. Every proposed business change still requires confirmation.</p></div></div>
    <form className="ai-settings-form" onSubmit={save}>
      <label className="toggle-row"><div><strong>Enable AI copilot</strong><span>Emergency off switch; the rest of AK OCP continues normally.</span></div><span className="switch"><input type="checkbox" checked={settings.enabled} onChange={(event) => update('enabled', event.target.checked)} /><i /></span></label>
      <div className="form-grid two">
        <Select label="Primary model" value={settings.primary_model} onChange={(event) => update('primary_model', event.target.value as AiSettings['primary_model'])}><option value="qwen/qwen3.6-27b">Qwen 3.6 27B</option><option value="openai/gpt-oss-20b">GPT OSS 20B</option></Select>
        <Select label="Fallback model" value={settings.fallback_model} onChange={(event) => update('fallback_model', event.target.value as AiSettings['fallback_model'])}><option value="openai/gpt-oss-20b">GPT OSS 20B</option><option value="qwen/qwen3.6-27b">Qwen 3.6 27B</option></Select>
      </div>
      <div className="form-grid two">
        <Input label="Daily prompts per user" type="number" min="1" max="1000" value={settings.daily_request_limit} onChange={(event) => update('daily_request_limit', Number(event.target.value))} required />
        <Input label="Maximum response tokens" type="number" min="64" max="1200" value={settings.max_output_tokens} onChange={(event) => update('max_output_tokens', Number(event.target.value))} required />
      </div>
      <div className="ai-provider-health">
        <span><Radio size={18} /></span>
        <div><strong>Provider health</strong><small>{settings.provider_checked_at ? `Last checked ${formatDate(settings.provider_checked_at, 'long')}` : 'A live check appears after the first successful prompt.'}{settings.provider_error ? ` · ${settings.provider_error}` : ''}</small></div>
        <Badge tone={settings.provider_status === 'available' ? 'green' : settings.provider_status === 'degraded' ? 'yellow' : settings.provider_status === 'unavailable' ? 'red' : 'neutral'}>{humanize(settings.provider_status)}</Badge>
      </div>
      <div className="security-callout"><KeyRound size={19} /><div><strong>Provider key stays server-side</strong><p>Set GROQ_API_KEY in Supabase Edge Function secrets. It is never saved in GitHub Pages or sent to the browser.</p></div></div>
      <div className="ai-settings-actions"><Button type="submit" loading={saving}>Save AI controls</Button></div>
    </form>
  </Card>
}

function ServicesSettings() {
  const { snapshot } = useAppData()
  const [selected, setSelected] = useState<Service | null>(null)
  if (!snapshot) return null
  return <Card className="settings-panel"><div className="settings-heading"><span><BadgeIndianRupee size={21} /></span><div><h2>Services & controlled pricing</h2><p>Order amounts are always copied from this catalog. Operations cannot enter arbitrary prices.</p></div></div><div className="service-settings-list">{snapshot.services.map((service) => <div key={service.id}><span className="service-code large">{service.code}</span><div><strong>{service.name}</strong><small>{service.description}</small></div><b>{formatCurrency(service.price)}</b><StatusBadge status={service.active ? 'active' : 'inactive'} /><button aria-label={`Edit ${service.code}`} onClick={() => setSelected(service)}><Edit3 size={17} /></button></div>)}</div><div className="security-callout"><LockKeyhole size={19} /><div><strong>Price integrity enabled</strong><p>Historical orders retain their price snapshot when catalog pricing changes.</p></div></div><EditServiceModal service={selected} onClose={() => setSelected(null)} /></Card>
}

function EditServiceModal({ service: selectedService, onClose }: { service: Service | null; onClose(): void }) {
  const { profile } = useAuth()
  const { service, execute, busyAction } = useAppData()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [active, setActive] = useState(true)
  useEffect(() => {
    if (selectedService) {
      setName(selectedService.name)
      setPrice(String(selectedService.price))
      setActive(selectedService.active)
    }
  }, [selectedService])
  if (!selectedService || !profile) return null
  const close = () => { setName(''); setPrice(''); setActive(true); onClose() }
  const submit = async (event: FormEvent) => { event.preventDefault(); await execute(`service-${selectedService.id}`, 'Service updated', () => service.updateService(selectedService.id, { name, price: Number(price), active }, profile)); close() }
  return <Modal open={Boolean(selectedService)} onClose={close} title={`Edit ${selectedService.code}`} description="Only Founder accounts can change controlled pricing." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="service-edit" type="submit" loading={busyAction === `service-${selectedService.id}`}>Save service</Button></>}><form id="service-edit" onSubmit={submit} className="form-stack"><Input label="Service name" value={name} onChange={(event) => setName(event.target.value)} required /><Input label="Price" type="number" min="1" step="1" value={price} onChange={(event) => setPrice(event.target.value)} required /><label className="toggle-row"><div><strong>Available for new orders</strong><span>Existing orders are never modified.</span></div><span className="switch"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><i /></span></label></form></Modal>
}

function TeamSettings() {
  const { profile } = useAuth()
  const { snapshot, service, execute, busyAction } = useAppData()
  const [change, setChange] = useState<{ member: Profile; role: Role } | null>(null)
  if (!snapshot || !profile) return null
  const confirm = async () => { if (!change) return; await execute(`profile-${change.member.id}`, 'Team role updated', () => service.updateProfileRole(change.member.id, change.role, profile)); setChange(null) }
  return <Card className="settings-panel"><div className="settings-heading"><span><UserCog size={21} /></span><div><h2>Team access</h2><p>Founder has full financial control. Operations manages the daily order workflow.</p></div></div><div className="team-list">{snapshot.profiles.map((member) => <div key={member.id}><span className="avatar large">{initials(member.full_name)}</span><div><strong>{member.full_name}{member.id === profile.id && <Badge tone="yellow">You</Badge>}</strong><small>{member.email}</small></div><Badge tone={member.role === 'founder' ? 'yellow' : 'blue'}>{humanize(member.role)}</Badge><select aria-label={`Role for ${member.full_name}`} value={member.role} disabled={member.id === profile.id || busyAction === `profile-${member.id}`} onChange={(event) => setChange({ member, role: event.target.value as Role })}><option value="founder">Founder</option><option value="operations">Operations</option></select></div>)}</div><div className="permissions-grid"><div><ShieldCheck size={18} /><strong>Founder</strong><p>Everything, including pricing, expenses, analytics, roles and withdrawal approval.</p></div><div><UserCog size={18} /><strong>Operations</strong><p>Orders, inventory, customers, payment proofs, completion and withdrawal requests.</p></div></div><ConfirmDialog open={Boolean(change)} onClose={() => setChange(null)} onConfirm={() => void confirm()} title="Change team role?" message={`${change?.member.full_name ?? 'This member'} will receive ${change?.role === 'founder' ? 'full Founder permissions' : 'Operations permissions'} on their next action.`} confirmLabel="Change role" loading={Boolean(change && busyAction === `profile-${change.member.id}`)} /></Card>
}

function AuditSettings() {
  const { snapshot } = useAppData()
  if (!snapshot) return null
  return <Card className="settings-panel audit-panel"><div className="settings-heading"><span><FileClock size={21} /></span><div><h2>Audit log</h2><p>Append-only history for critical business changes.</p></div></div><div className="audit-list">{snapshot.auditLogs.map((entry) => <div key={entry.id}><span className="audit-dot" /><div><strong>{entry.actor?.full_name ?? 'System'} <em>{humanize(entry.action)}</em> {humanize(entry.entity_type)}</strong><small>{formatDate(entry.created_at, 'long')} · {entry.entity_id?.slice(0, 12)}</small></div><Badge>{humanize(entry.entity_type)}</Badge></div>)}</div></Card>
}

function SystemSettings() {
  const systemRows = [
    { icon: Cloud, label: 'Application mode', value: 'Supabase connected', tone: 'green' },
    { icon: Radio, label: 'Realtime updates', value: 'Enabled', tone: 'green' },
    { icon: Database, label: 'Offline cache', value: 'IndexedDB enabled', tone: 'green' },
    { icon: KeyRound, label: 'Authentication', value: 'Supabase Auth', tone: 'green' }
  ] as const
  return <div className="system-settings"><Card className="settings-panel"><div className="settings-heading"><span><Database size={21} /></span><div><h2>Application status</h2><p>Runtime, storage, connectivity, and data protection health.</p></div></div><div className="system-status-list">{systemRows.map(({ icon: Icon, label, value, tone }) => <div key={label}><Icon size={19} /><span><small>{label}</small><strong>{value}</strong></span><Badge tone={tone}><CheckCircle2 size={12} /> Ready</Badge></div>)}</div></Card><Card className="security-panel"><ShieldCheck size={26} /><div><h3>Security baseline</h3><p>Row level security, role checks, soft delete, immutable wallet entries, private storage buckets, and audit triggers are defined in the Supabase schema.</p><div><Badge tone="green">RLS</Badge><Badge tone="green">Private storage</Badge><Badge tone="green">Audit trail</Badge><Badge tone="green">Soft delete</Badge></div></div></Card><Card className="backup-panel"><div><span><Database size={19} /></span><div><h3>Daily backup</h3><p>Enable Supabase project backups or schedule a daily PostgreSQL dump once this project moves beyond the free tier.</p></div></div><Badge tone="yellow">Owner action</Badge></Card></div>
}
