import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { BrandMark, Button, Input, cn } from '../components/ui'
import { isSupabaseConfigured } from '../lib/supabase'

export function AuthPage() {
  const { signIn, signUp, resetPassword, error: authError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'signup') setMessage(await signUp(fullName, email, password))
      else await signIn(email, password)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!email) { setError('Enter your email address first.'); return }
    setBusy(true)
    try {
      await resetPassword(email)
      setMessage('Password reset link sent. Check your inbox.')
      setError(null)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not send the reset link.')
    } finally { setBusy(false) }
  }

  return (
    <main className="auth-page">
      <section className="auth-showcase">
        <div className="stage-glow glow-one" /><div className="stage-glow glow-two" />
        <BrandMark withName size="large" />
        <div className="showcase-copy">
          <span className="showcase-kicker"><Sparkles size={15} /> Operational command center</span>
          <h1>Every track is an asset.<br /><em>Every order counts.</em></h1>
          <p>One focused workspace for karaoke inventory, customer orders, payments, expenses, withdrawals, and business performance.</p>
        </div>
        <div className="showcase-features">
          <div><ShieldCheck size={20} /><span><strong>Controlled finance</strong><small>Approvals, wallet ledger and audit logs</small></span></div>
          <div><Sparkles size={20} /><span><strong>Track-first workflow</strong><small>Search before creating duplicate karaoke</small></span></div>
        </div>
        <p className="brand-line">Professional · Trustworthy · Fast · Music-first</p>
      </section>
      <section className="auth-panel">
        <div className="mobile-auth-brand"><BrandMark withName /></div>
        <div className="auth-card">
          <div className="auth-heading"><span>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</span><h2>{mode === 'signin' ? 'Sign in to AK OCP' : 'Join the operations team'}</h2><p>{mode === 'signin' ? 'Use your approved business account to continue.' : 'The first account becomes Founder. Later accounts join Operations.'}</p></div>
          <div className="auth-tabs"><button className={cn(mode === 'signin' && 'active')} onClick={() => setMode('signin')}>Sign in</button><button className={cn(mode === 'signup' && 'active')} onClick={() => setMode('signup')}>Register</button></div>
          <form onSubmit={submit} className="auth-form">
            {mode === 'signup' && <div className="input-with-icon"><UserRound size={18} /><Input label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" autoComplete="name" required minLength={2} /></div>}
            <div className="input-with-icon"><Mail size={18} /><Input label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@abhinandkaraokes.com" autoComplete="email" required /></div>
            <div className="input-with-icon"><LockKeyhole size={18} /><Input label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            {mode === 'signin' && <button type="button" className="forgot-link" onClick={() => void reset()}>Forgot password?</button>}
            {(error || authError) && <p className="form-alert error">{error || authError}</p>}
            {message && <p className="form-alert success">{message}</p>}
            <Button type="submit" loading={busy} disabled={!isSupabaseConfigured} className="auth-submit">{mode === 'signin' ? 'Sign in securely' : 'Create account'}<ArrowRight size={17} /></Button>
          </form>
          {!isSupabaseConfigured && <p className="setup-note">Supabase configuration is required before authentication.</p>}
        </div>
        <p className="auth-footer">Abhinand Karaokes · Premium music operations</p>
      </section>
    </main>
  )
}
