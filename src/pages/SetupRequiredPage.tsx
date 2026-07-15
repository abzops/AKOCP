import { CheckCircle2, Copy, Database, ExternalLink, FileCode2 } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { BrandMark, Button } from '../components/ui'

export function SetupRequiredPage({ message }: { message: string }) {
  const { signOut } = useAuth()
  const [copied, setCopied] = useState(false)
  const copyPath = async () => {
    await navigator.clipboard.writeText('supabase/schema.sql')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return (
    <main className="setup-required">
      <BrandMark withName size="large" />
      <div className="setup-card">
        <span className="setup-icon"><Database size={27} /></span>
        <p className="eyebrow">One-time backend setup</p>
        <h1>Initialize the AK OCP database</h1>
        <p>{message}</p>
        <ol className="setup-steps">
          <li><span>1</span><div><strong>Open Supabase SQL Editor</strong><small>Use the project supplied for Abhinand Karaokes.</small></div><ExternalLink size={17} /></li>
          <li><span>2</span><div><strong>Run the complete schema</strong><small>The file creates tables, RLS, functions, storage policies and seed services.</small></div><button onClick={() => void copyPath()}>{copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'schema.sql'}</button></li>
          <li><span>3</span><div><strong>Register the Founder account</strong><small>The first registered account is automatically assigned Founder permissions.</small></div><FileCode2 size={17} /></li>
        </ol>
        <div className="setup-actions"><Button onClick={() => void signOut()}>Back to sign in</Button></div>
      </div>
    </main>
  )
}
