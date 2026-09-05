import { createClient, UserRole } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function signIn(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  // Check if email is registered in people table
  const { data: assignment, error: assignmentError } = await supabase
    .from('people')
    .select('*')
    .eq('email', email)
    .single()

  if (assignmentError || !assignment) {
    // Sign out if not recognized
    await supabase.auth.signOut()
    return {
      success: false,
      error: 'not_recognized',
      message: 'This email is not recognized. Please contact your property manager.',
    }
  }

  return { success: true, assignment }
}

export async function signUp(email: string, password: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
}

export async function getUserAssignment(email: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !data) {
    return null
  }

  return data as { email: string; role: UserRole; property_id?: string; room_id?: string }
}

export async function getCurrentUser(supabaseInstance?: SupabaseClient) {
  let supabase: SupabaseClient

  if (supabaseInstance) {
    supabase = supabaseInstance
  } else {
    // In API routes (server context), use the route-handler client so it reads
    // the auth cookie from the incoming request. In client components, next/headers
    // is unavailable so we fall back to the browser anon client (localStorage auth).
    try {
      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
      const { cookies } = await import('next/headers')
      supabase = createRouteHandlerClient({ cookies }) as unknown as SupabaseClient
    } catch {
      supabase = createClient()
    }
  }

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const assignment = await getUserAssignment(user.email || '')
  return { user, assignment }
}
