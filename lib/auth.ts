import { createClient, UserRole } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Returns a short sign-off string for SMS messages, e.g. "Harry | 07700 900123"
 * Falls back gracefully if no direct_phone is set.
 */
export async function getSmsSignOff(userEmail: string): Promise<string> {
  try {
    const sb = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await sb
      .from('people')
      .select('first_name, preferred_name, direct_phone, email')
      .eq('email', userEmail)
      .maybeSingle()
    if (!data) return 'Capital Rooms'
    const name    = (data as any).preferred_name || data.first_name || 'Capital Rooms'
    const contact = data.direct_phone || data.email || ''
    return contact ? `${name}, Capital Rooms | ${contact}` : `${name}, Capital Rooms`
  } catch {
    return 'Capital Rooms'
  }
}

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
  const supabase = supabaseInstance || createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const assignment = await getUserAssignment(user.email || '')
  return { user, assignment }
}
