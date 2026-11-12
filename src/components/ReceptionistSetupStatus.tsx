import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ServerCog } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button } from './ui'
import '../receptionist-setup.css'

type BackendStatus = {
  backend: 'online'
  database: 'connected'
  catalog_prices_verified: boolean
  indexed_inventory_tracks: number
  verified_inventory_formats: number
  tool_token_configured: boolean
  webhook_token_configured: boolean
  recording_provider_configured: boolean
  sarvam_phone_deployment: 'not_verified'
  bsnl_call_forwarding: 'not_verified'
  generated_at: string
}

export function ReceptionistSetupStatus() {
  const { profile } = useAuth()
  const [readiness, setReadiness] = useState<BackendStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fnError } = await supabase.functions.invoke<BackendStatus>('receptionist-status', {
      method: 'POST', body: {},
    })
    if (fnError || !data || data.backend !== 'online') {
      setReadiness(null)
      setError('Readiness report unavailable. Check your signed-in Founder session and deployed receptionist-status function.')
    } else {
      setReadiness(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (profile?.role === 'founder') void check() }, [profile?.role, check])
  if (profile?.role !== 'founder') return null

  const steps = readiness ? [
    { label: 'AKOCP database online', pass: readiness.database === 'connected' },
    { label: 'Business pricing verified', pass: readiness.catalog_prices_verified },
    { label: 'Sarvam API tool credential configured', pass: readiness.tool_token_configured },
    { label: 'Sarvam end-call webhook credential configured', pass: readiness.webhook_token_configured },
    { label: 'Sarvam recording API settings configured', pass: readiness.recording_provider_configured },
    { label: 'Ready-made song formats verified', pass: readiness.verified_inventory_formats > 0 },
  ] : []
  const passed = steps.filter(x => x.pass).length

  return <section className="ak-voice-section ak-voice-setup">
    <header className="ak-voice-section-heading">
      <div><h2><ServerCog size={20} /> AI provider & server readiness</h2>
        <p>Founder-only diagnostics. Tokens, API keys, and private values are never displayed.</p></div>
      <Button variant="secondary" icon={<RefreshCw size={16} />} disabled={loading} onClick={() => void check()}>
        {loading ? 'Checking…' : 'Check connection'}
      </Button>
    </header>
    {error ? <div className="ak-voice-error" role="alert">{error}</div> : null}
    {readiness ? <div className="ak-voice-setup-body">
      <div className="ak-voice-setup-summary">
        <strong>{passed} of {steps.length} server checks ready</strong>
        <span>{readiness.indexed_inventory_tracks.toLocaleString('en-IN')} catalog songs · {readiness.verified_inventory_formats.toLocaleString('en-IN')} formats verified</span>
      </div>
      <div className="ak-voice-setup-grid">
        {steps.map(item => <div className="ak-voice-setup-step" key={item.label}>
          {item.pass ? <CheckCircle2 size={18} className="ak-ok"/> : <AlertTriangle size={18} className="ak-pending"/>}
          <span>{item.label}</span><small>{item.pass ? 'Ready' : 'Action needed'}</small>
        </div>)}
      </div>
      <p className="ak-voice-setup-caution">A configured secret does not verify the phone connection. Sarvam inbound deployment, caller ID, BSNL forwarding and consent must be tested manually before routing real customers.</p>
      <div className="ak-voice-setup-links">
        <a href="https://github.com/abzops/AKOCP/blob/master/docs/SARVAM_PROVIDER_SETUP.md" target="_blank" rel="noreferrer">Step-by-step provider setup <ExternalLink size={14}/></a>
        <a href="https://supabase.com/dashboard/project/cqptdpkhaiomitwzjysp/functions" target="_blank" rel="noreferrer">Open AKOCP Supabase <ExternalLink size={14}/></a>
        <a href="https://indus.sarvam.ai/samvaad" target="_blank" rel="noreferrer">Open Sarvam Voice Agents <ExternalLink size={14}/></a>
      </div>
    </div> : loading ? <p className="ak-voice-setup-loading">Reading live configuration…</p> : null}
  </section>
}
