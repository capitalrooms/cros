// Server-side "who is signed in" for API routes.
//
// Browser sessions live in localStorage (key `cros-auth`), not cookies, so cookie-based helpers
// (@supabase/auth-helpers-nextjs `createRouteHandlerClient({ cookies })`, or the browser client's
// getUser() run on the server) never see a signed-in user — and the auth-helpers one crashes on
// Next 16 because cookies() is async. The browser now sends the access token as a Bearer header on
// every same-origin /api request (app/components/AuthFetchBridge.tsx); this module reads it.
//
// Drop-in replacements with the same names and shapes:
//   createRouteHandlerClient({ cookies })  → Supabase client acting as the signed-in user,
//                                             with auth.getSession()/getUser() resolved from the token
//   getCurrentUser()                        → { user, assignment, id, email, role } | null
import { headers } from 'next/headers'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const service = () => createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** The Bearer token on the current request, if any. */
export async function requestToken(): Promise<string | null> {
  try {
    const h = await headers()
    return h.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || null
  } catch {
    return null   // called outside a request (e.g. a script) — no user
  }
}

/** The signed-in Supabase user for this request, verified with Supabase. */
export async function requestUser(): Promise<User | null> {
  const token = await requestToken()
  if (!token) return null
  const { data, error } = await service().auth.getUser(token)
  return error ? null : data.user
}

/**
 * Supabase client that acts as the signed-in user (RLS applies as them).
 * Same call shape as the old auth-helpers function; the argument is ignored.
 */
export function createRouteHandlerClient(_opts?: unknown): SupabaseClient {
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: async (input: RequestInfo | globalThis.URL, init?: RequestInit) => {
        const token = await requestToken()
        const h = new Headers(init?.headers)
        if (token) h.set('Authorization', `Bearer ${token}`)
        return fetch(input, { ...init, headers: h })
      },
    },
  })
  const auth = client.auth as unknown as Record<string, unknown>
  auth.getSession = async () => {
    const token = await requestToken()
    const user = token ? await requestUser() : null
    return { data: { session: user ? { user, access_token: token } : null }, error: null }
  }
  auth.getUser = async () => {
    const user = await requestUser()
    return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'Not signed in' } }
  }
  return client
}

export interface CurrentUser {
  user: User
  assignment: { id: string; email: string; role: string; property_id?: string | null; room_id?: string | null; [k: string]: unknown } | null
  id: string | null      // people.id (NOT auth.uid)
  email: string | null
  role: string | null
}

/** The signed-in user plus their `people` row. Same shape as lib/auth getCurrentUser, plus id/email/role. */
export async function getCurrentUser(_instance?: unknown): Promise<CurrentUser | null> {
  const user = await requestUser()
  if (!user?.email) return null
  const { data } = await service().from('people').select('*').ilike('email', user.email).maybeSingle()
  return { user, assignment: data ?? null, id: data?.id ?? null, email: user.email, role: data?.role ?? null }
}
