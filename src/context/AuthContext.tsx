import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { isSupabaseConfigured, normalizeSupabaseError, supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  signIn(email: string, password: string): Promise<void>
  signUp(fullName: string, email: string, password: string): Promise<string>
  resetPassword(email: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (activeSession: Session) => {
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', activeSession.user.id).single()
    if (profileError) throw normalizeSupabaseError(profileError)
    setProfile(data as Profile)
  }, [])

  useEffect(() => {
    let mounted = true
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      try {
        setSession(data.session)
        if (data.session) await loadProfile(data.session)
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : 'Unable to load your profile.')
      } finally {
        if (mounted) setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setError(null)
      if (nextSession) {
        window.setTimeout(() => {
          loadProfile(nextSession).catch((profileError) => setError(profileError instanceof Error ? profileError.message : 'Unable to load your profile.'))
        }, 0)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    error,
    async signIn(email, password) {
      setError(null)
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw normalizeSupabaseError(signInError)
    },
    async signUp(fullName, email, password) {
      setError(null)
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      })
      if (signUpError) throw normalizeSupabaseError(signUpError)
      return data.session ? 'Account created and signed in.' : 'Account created. Check your email to confirm the address.'
    },
    async resetPassword(email) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`
      })
      if (resetError) throw normalizeSupabaseError(resetError)
    },
    async signOut() {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw normalizeSupabaseError(signOutError)
    }
  }), [error, loading, profile, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
