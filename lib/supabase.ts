import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Create a singleton instance to avoid multiple GoTrueClient instances
let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseInstance
}

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS, so it
 * must NEVER be imported into client components — only trusted server routes
 * (cron jobs, admin-triggered generation) where there is no user session to
 * authenticate as. Using the anon client in these routes hits RLS and fails.
 */
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type UserRole = 'administrator' | 'tenant' | 'contractor' | 'cleaner' | 'landlord' | 'lettings'

export interface UserAssignment {
  id: string
  email: string
  role: UserRole
  property_id?: string
  room_id?: string
  created_at: string
  updated_at: string
}
