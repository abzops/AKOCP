import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { isSupabaseConfigured, normalizeSupabaseError, supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  passwordRecovery: boolean
  signIn(email: string, password: string): Promise<void>
  signUp(fullName: string, email: string, password: string): Promise<string>
  resetPassword(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const activeUserId = useRef<string | null>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery' || sessionStorage.getItem('akocp-password-recovery') === '1'
  )

  const loadProfile = useCallback(async (activeSession: Session) => {
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', activeSession.user.id).single()
    if (profileError) throw normalizeSupabaseError(profileError)
    if (activeUserId.current === activeSession.user.id) setProfile(data as Profile)
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
        activeUserId.current = data.session?.user.id ?? null
        if (data.session) await loadProfile(data.session)
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : 'Unable to load your profile.')
      } finally {
        if (mounted) setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      activeUserId.current = nextSession?.user.id ?? null
      setError(null)
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('akocp-password-recovery', '1')
        setPasswordRecovery(true)
      }
      if (nextSession) {
        window.setTimeout(() => {
          loadProfile(nextSession).catch((profileError) => setError(profileError instanceof Error ? profileError.message : 'Unable to load your profile.'))
        }, 0)
      } else {
        setProfile(null)
        setPasswordRecovery(false)
        sessionStorage.removeItem('akocp-password-recovery')
      }
    })

    return () => {
      mounted = false
      activeUserId.current = null
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  useEffect(() => {
    if (!session) return
    const channel = supabase.channel(`akocp-access-${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, () => {
        void loadProfile(session).catch(() => setProfile(null))
      }).subscribe()
    const checkAccess = () => {
      if (document.visibilityState === 'visible') void loadProfile(session).catch(() => setProfile(null))
    }
    document.addEventListener('visibilitychange', checkAccess)
    return () => {
      document.removeEventListener('visibilitychange', checkAccess)
      void supabase.removeChannel(channel)
    }
  }, [session, loadProfile])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    profile,
    loading,
    error,
    passwordRecovery,
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
      return data.session ? 'Account created. A Founder must approve your workspace access.' : 'Account created. Confirm your email, then wait for Founder approval.'
    },
    async resetPassword(email) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`
      })
      if (resetError) throw normalizeSupabaseError(resetError)
    },
    async updatePassword(password) {
      if (!passwordRecovery || !session) throw new Error('Open a valid password reset link first.')
      if (password.length < 8) throw new Error('Use at least 8 characters.')
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw normalizeSupabaseError(updateError)
      sessionStorage.removeItem('akocp-password-recovery')
      setPasswordRecovery(false)
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`)
    },
    async signOut() {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw normalizeSupabaseError(signOutError)
      activeUserId.current = null
      sessionStorage.removeItem('akocp-password-recovery')
      setPasswordRecovery(false)
      setProfile(null)
      setSession(null)
    }
  }), [error, loading, passwordRecovery, profile, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
