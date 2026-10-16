// Guards for routes used by the tenant, contractor, cleaner and lettings apps (the office uses lib/adminAuth).
// Every route that uses the service key must first prove WHO is calling and that they may act on THIS record —
// the service key skips the database's own row rules (migration 192), so the check has to happen here.
import type { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { secondStepMissing, administratorWithoutTwoStep } from '@/lib/auth/aal'

export interface Caller { userId: string; email: string; personId: string; role: string }
export const STAFF_ROLES = ['administrator', 'admin', 'lettings']

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

// A warm server remembers who a token belongs to for a minute (as lib/access/server officeCaller does), so a page's
// several calls don't each re-check the sign-in with the auth service and look the person up again (16 Oct 2026).
const MEMO_MS = 60_000
const memo = new Map<string, { at: number; who: Caller | null }>()

/** The signed-in person making the request (from the Bearer token the apps send), or null. */
export async function requireSignedIn(req: NextRequest): Promise<Caller | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const hit = memo.get(token)
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.who
  const s = svc()
  let who: Caller | null = null
  const { data: { user } } = await s.auth.getUser(token)
  if (user?.email && !secondStepMissing(user, token)) {
    const { data: p } = await s.from('people').select('id, role').ilike('email', user.email).order('created_at').limit(1).maybeSingle()
    if (p && p.role !== 'inactive' && !administratorWithoutTwoStep(p.role, user)) who = { userId: user.id, email: user.email, personId: p.id, role: p.role }
  }
  if (memo.size > 500) memo.clear()
  memo.set(token, { at: Date.now(), who })
  return who
}

export const isStaff = (c: Caller | null) => !!c && STAFF_ROLES.includes(c.role)

/** Office staff (administrator, admin, lettings). */
export async function requireStaff(req: NextRequest): Promise<Caller | null> {
  const c = await requireSignedIn(req)
  return isStaff(c) ? c : null
}

/** May this person work on this maintenance job? Office staff, or the contractor it is assigned to. */
export async function canWorkOnTicket(c: Caller | null, ticketId: string, s: SupabaseClient = svc()): Promise<boolean> {
  if (!c) return false
  if (isStaff(c)) return true
  const { data: t } = await s.from('maintenance_tickets').select('contractor_id').eq('id', ticketId).maybeSingle()
  return !!t && t.contractor_id === c.personId
}

/** May this person send things to / act at this property? Staff; cleaners (portfolio-wide); the contractor with a
 *  job there; a tenant living there. */
export async function canActAtProperty(c: Caller | null, propertyId: string, s: SupabaseClient = svc()): Promise<boolean> {
  if (!c) return false
  if (isStaff(c) || c.role === 'cleaner') return true
  if (c.role === 'contractor') {
    const { count } = await s.from('maintenance_tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('contractor_id', c.personId)
    return (count ?? 0) > 0
  }
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await s.from('tenancies').select('id', { count: 'exact', head: true }).eq('property_id', propertyId)
    .or(`person_id.eq.${c.personId},co_tenant_id.eq.${c.personId}`).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  return (count ?? 0) > 0
}
