// Sign-in safety: every sign-in attempt and every reset email is written to audit_logs, and wrong passwords are counted
// per address and per internet address. The counts come from audit_logs, so no new table is needed.
// Limits are generous enough for a person who has mistyped a few times, and short enough to stop guessing.
import type { SupabaseClient } from '@supabase/supabase-js'

export const LOCK_AFTER = 5          // wrong passwords for one address…
export const LOCK_MINUTES = 15       // …locks that address for this long
export const IP_LIMIT = 40           // wrong passwords from one internet address…
export const IP_WINDOW_MINUTES = 15  // …in this window
export const RESET_PER_IP = 10       // reset emails asked for from one internet address…
export const RESET_WINDOW_MINUTES = 60

const since = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/** Is this address (or this internet address) locked out of password sign-in right now? */
export async function signInLock(s: SupabaseClient, email: string, ip: string): Promise<{ locked: boolean; minutes: number }> {
  const addr = email.trim().toLowerCase()
  const { count: byAddr } = await s.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('action', 'signin_failed').eq('details', addr).gte('created_at', since(LOCK_MINUTES))
  if ((byAddr ?? 0) >= LOCK_AFTER) return { locked: true, minutes: LOCK_MINUTES }
  const { count: byIp } = await s.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('action', 'signin_failed').eq('ip_address', ip).gte('created_at', since(IP_WINDOW_MINUTES))
  if ((byIp ?? 0) >= IP_LIMIT) return { locked: true, minutes: IP_WINDOW_MINUTES }
  return { locked: false, minutes: 0 }
}

/** Record one sign-in attempt. Only failures count towards a lock; successes are kept for the record. */
export async function logSignIn(s: SupabaseClient, email: string, ok: boolean, ip: string): Promise<void> {
  await s.from('audit_logs').insert({
    user_id: 'unknown',
    action: ok ? 'signin_ok' : 'signin_failed',
    details: email.trim().toLowerCase(),
    ip_address: ip,
  })
}

/** May this internet address ask for another reset email? */
export async function resetAllowed(s: SupabaseClient, ip: string): Promise<boolean> {
  const { count } = await s.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('action', 'password_reset_requested').eq('ip_address', ip).gte('created_at', since(RESET_WINDOW_MINUTES))
  return (count ?? 0) < RESET_PER_IP
}
