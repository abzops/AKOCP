import { useState, type FormEvent } from 'react'
import { BrandMark, Button, Input } from '../components/ui'
import { useAuth } from '../context/AuthContext'

export function PasswordRecoveryPage() {
  const { session, updatePassword, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) { setError('The passwords do not match.'); return }
    setBusy(true)
    setError(null)
    try { await updatePassword(password) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the password.') }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><section className="auth-panel"><div className="auth-card">
    <BrandMark withName />
    <div className="auth-heading"><h2>Set a new password</h2><p>Choose a password for your AK OCP account.</p></div>
    <form className="auth-form" onSubmit={submit}>
      <Input label="New password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
      <Input label="Confirm password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {error && <p className="form-alert error" role="alert">{error}</p>}
      {!session && <p className="form-alert error">This reset link has expired. Request a new link from sign in.</p>}
      <Button type="submit" loading={busy} disabled={!session}>Save password</Button>
      <Button type="button" variant="ghost" onClick={() => void signOut()}>Back to sign in</Button>
    </form>
  </div></section></main>
}
