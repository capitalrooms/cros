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
      .select('salutation, first_name, preferred_name, direct_phone, email')
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
  // new-device sign-in alert (app/api/auth/sign-in-alert) — never holds up signing in
  if (data.session?.access_token) fetch('/api/auth/sign-in-alert', { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${data.session.access_token}` } }).catch(() => {})

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
  forgetCurrentUser()
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

// Who is using this screen. Screens only use this to decide what to show — every read and write is checked again by
// the database's row rules and the server routes — so it reads the sign-in the browser already holds instead of asking
// the auth service over the network (that alone took ~1.6s on every page, 16 Oct 2026), and remembers the person's
// record for two minutes while moving between pages. On the server it still verifies with the auth service.
type CurrentUser = { user: any; assignment: Awaited<ReturnType<typeof getUserAssignment>> }
let _current: { userId: string; at: number; value: CurrentUser } | null = null
let _pending: Promise<CurrentUser | null> | null = null
const CURRENT_MS = 120_000

export async function getCurrentUser(supabaseInstance?: SupabaseClient): Promise<CurrentUser | null> {
  const supabase = supabaseInstance || createClient()
  const inBrowser = typeof window !== 'undefined'
  let user: any = null
  if (inBrowser) {
    const { data: { session } } = await supabase.auth.getSession()
    user = session?.user ?? null
  } else {
    const { data, error } = await supabase.auth.getUser()
    user = error ? null : data.user
  }
  if (!user) { _current = null; return null }
  if (!inBrowser) return { user, assignment: await getUserAssignment(user.email || '') }
  if (_current && _current.userId === user.id && Date.now() - _current.at < CURRENT_MS) return _current.value
  if (_pending) return _pending
  _pending = (async () => {
    const value = { user, assignment: await getUserAssignment(user.email || '') }
    _current = { userId: user.id, at: Date.now(), value }
    return value
  })().finally(() => { _pending = null })
  return _pending
}

/** Forget the remembered person — after signing out, or after changing their own record. */
export function forgetCurrentUser() { _current = null }
