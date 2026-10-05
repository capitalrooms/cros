// Sign-in, reset and invite links that CROS makes and sends itself (server only — needs the service key).
// Supabase's own emails bounce through its "Site URL", which was set to localhost, so links landed nowhere. Here we
// ask Supabase for the one-time token only and build the link to our own /auth/confirm page, which signs the person
// in when they tap Continue (so an email scanner opening the link can't use it up). No Supabase setting can break it.
import type { SupabaseClient } from '@supabase/supabase-js'
import { PORTAL_URL } from '@/lib/emailWrapper'

export type LinkKind = 'recovery' | 'magiclink' | 'invite'

/** A one-time link for an existing account; null when there's no account for that email (or Supabase refused). */
export async function authLink(s: SupabaseClient, email: string, kind: LinkKind, next = '/'): Promise<string | null> {
  const { data, error } = await s.auth.admin.generateLink({ type: kind as any, email: email.trim().toLowerCase() })
  const token = (data as any)?.properties?.hashed_token
  if (error || !token) return null
  const type = kind === 'magiclink' ? 'email' : kind
  return `${PORTAL_URL}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=${type}&next=${encodeURIComponent(next)}`
}
