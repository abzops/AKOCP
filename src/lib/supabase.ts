import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'akocp-auth'
    },
    global: {
      headers: { 'x-application-name': 'abhinand-karaokes-ocp' }
    }
  }
)

export class BackendSetupError extends Error {
  constructor(message = 'The Supabase database is not initialized yet. Run supabase/schema.sql in the SQL editor.') {
    super(message)
    this.name = 'BackendSetupError'
  }
}

export function normalizeSupabaseError(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const value = error as { code?: string; message?: string }
    if (['PGRST205', '42P01', 'PGRST204'].includes(value.code ?? '') || value.message?.includes('schema cache')) {
      return new BackendSetupError()
    }
    return new Error(value.message || 'Supabase request failed')
  }
  return new Error('Supabase request failed')
}
