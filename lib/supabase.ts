import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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
 * Server-side Supabase client that reads auth session from cookies
 * Use this in API routes to get proper user authentication context
 */
export async function createServerClient() {
  const cookieStore = await cookies()
  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'supabase-next/server',
      },
    },
  })

  // Extract session from cookies if available
  const sessionCookie = cookieStore.get('sb-' + supabaseUrl.split('.')[0] + '-auth-token')
  if (sessionCookie?.value) {
    const session = JSON.parse(sessionCookie.value)
    if (session?.access_token) {
      // Set the auth header for this specific request
      supabase.auth.setSession(session)
    }
  }

  return supabase
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
