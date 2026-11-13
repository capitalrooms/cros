// Guards for routes used by the tenant, contractor, cleaner and lettings apps (the office uses lib/adminAuth).
// Every route that uses the service key must first prove WHO is calling and that they may act on THIS record —
// the service key skips the database's own row rules (migration 192), so the check has to happen here.
import type { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { secondStepMissing, administratorWithoutTwoStep } from '@/lib/auth/aal'

export interface Caller { userId: string; email: string; personId: string; role: string; /** the administrator's own person id, when viewing as this tenant (read-only) */ viewingAsBy?: string }
export const STAFF_ROLES = ['administrator', 'admin', 'lettings']

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

// A warm server remembers who a token belongs to for a minute (as lib/access/server officeCaller does), so a page's
// several calls don't each re-check the sign-in with the auth service and look the person up again (16 Oct 2026).
const MEMO_MS = 60_000
const memo = new Map<string, { at: number; who: Caller | null }>()

/** The signed-in person making the request (from the Bearer token the apps send), or null. */
export async function requireSignedIn(req: NextRequest): Promise<Caller | null> {
  const who = await signedIn(req)
  // while viewing a tenant's app nothing may be sent or changed — refuse outright rather than act as the administrator
  if (who && req.headers.get('x-view-as') && req.method !== 'GET' && req.method !== 'HEAD') return null
  return who ? viewingAs(req, who) : null
}

/**
 * "View as" a tenant (13 Nov 2026): an administrator looking at a tenant's app gets that tenant's data back — but only
 * for reading (GET). Anything that sends or changes something still runs as the administrator, and the tenant-only
 * routes refuse that, so nothing can be done in a tenant's name. lib/viewAs.
 */
async function viewingAs(req: NextRequest, who: Caller): Promise<Caller> {
  const id = req.headers.get('x-view-as')
  if (!id || who.role !== 'administrator' || req.method !== 'GET' || !/^[0-9a-f-]{36}$/i.test(id)) return who
  const { data: t } = await svc().from('people').select('id, role, email').eq('id', id).maybeSingle()
  if (!t || t.role !== 'tenant') return who
  return { userId: who.userId, email: t.email ?? who.email, personId: t.id, role: 'tenant', viewingAsBy: who.personId }
}

async function signedIn(req: NextRequest): Promise<Caller | null> {
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
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { count } = await s.from('tenancies').select('id', { count: 'exact', head: true }).eq('property_id', propertyId)
    .or(`person_id.eq.${c.personId},co_tenant_id.eq.${c.personId}`).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  return (count ?? 0) > 0
}
