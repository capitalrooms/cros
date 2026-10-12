// Sign-in accounts, run by the office (12 Oct 2026) — lib/auth/accounts.
// GET  → { statuses: { [personId]: AccountStatus }, groups: { tenants|landlords|contractors|cleaners|office: personId[] }, me }
// POST { action: 'send' | 'off' | 'on' | 'clear_two_step', personIds: string[] }  (at most 25 a call — the screen sends
//      a big group in batches) → { done: [{ id, name, result }], failed: [{ id, name, error }] }
//   send = an invite if they have no login yet, otherwise a password reset link.
// Tenants and landlords only get these when staff-chosen messages are on (Settings), like every other chosen send.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { getClientIp } from '@/lib/auditLog'
import { getElectedCommsLive } from '@/lib/comms'
import { authUsersByEmail, statusOf, sendAccountEmail, setAccess, clearTwoStep } from '@/lib/auth/accounts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ROLES = ['tenant', 'landlord', 'contractor', 'cleaner', 'administrator', 'admin', 'lettings']
const name = (p: any) => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.company || p.email

async function groupsOf(s: ReturnType<typeof createServiceClient>, people: any[]) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const soon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
  // tenants living in (or moving into, within 60 days) a real house — not demo houses, not lets that fell through
  const { data: tens } = await s.from('tenancies').select('person_id, start_date, end_date, let_cancelled_at, properties(is_demo)')
    .lte('start_date', soon).or(`end_date.is.null,end_date.gte.${today}`).is('let_cancelled_at', null)
  const currentTenants = new Set(((tens ?? []) as any[]).filter(t => !t.properties?.is_demo).map(t => t.person_id))
  const { data: props } = await s.from('properties').select('landlord_id, is_demo')
  const activeLandlords = new Set(((props ?? []) as any[]).filter(p => !p.is_demo && p.landlord_id).map(p => p.landlord_id))
  const ids = (f: (p: any) => boolean) => people.filter(p => p.email && f(p)).map(p => p.id)
  return {
    tenants: ids(p => p.role === 'tenant' && currentTenants.has(p.id)),
    landlords: ids(p => p.role === 'landlord' && activeLandlords.has(p.id)),
    contractors: ids(p => p.role === 'contractor'),
    cleaners: ids(p => p.role === 'cleaner'),
    office: ids(p => ['administrator', 'admin', 'lettings'].includes(p.role)),
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const { data: people, error } = await s.from('people').select('id, email, role').in('role', ROLES)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const users = await authUsersByEmail(s)
  const statuses: Record<string, ReturnType<typeof statusOf>> = {}
  for (const p of people ?? []) if (p.email) statuses[p.id] = statusOf(users.get(p.email.toLowerCase()))
  return NextResponse.json({ statuses, groups: await groupsOf(s, people ?? []), me: admin.personId })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const action = String(b.action ?? '')
  if (!['send', 'off', 'on', 'clear_two_step'].includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const ids: string[] = (Array.isArray(b.personIds) ? b.personIds : []).filter((x: unknown) => typeof x === 'string').slice(0, 25)
  if (!ids.length) return NextResponse.json({ error: 'Nobody chosen' }, { status: 400 })
  if (action === 'off' && ids.includes(admin.personId)) return NextResponse.json({ error: 'You can’t turn off your own sign-in.' }, { status: 400 })

  const s = createServiceClient()
  const { data: people } = await s.from('people').select('id, email, role, first_name, last_name, company').in('id', ids)
  const elected = await getElectedCommsLive()
  const users = action === 'send' ? await authUsersByEmail(s) : undefined
  const done: any[] = [], failed: any[] = []
  for (const p of (people ?? []) as any[]) {
    const who = { id: p.id, name: name(p) }
    if (!p.email) { failed.push({ ...who, error: 'no email address' }); continue }
    if (!ROLES.includes(p.role)) { failed.push({ ...who, error: `role "${p.role}" can’t sign in` }); continue }
    let r: { ok: boolean; error?: string; sent?: string; removed?: number }
    if (action === 'send') {
      if (!elected && ['tenant', 'landlord'].includes(p.role)) { failed.push({ ...who, error: 'staff-chosen messages are paused (Settings)' }); continue }
      r = await sendAccountEmail(s, p, req, users)
      await new Promise(res => setTimeout(res, 550))   // the email service allows about 2 a second
    } else if (action === 'clear_two_step') r = await clearTwoStep(s, p.email)
    else r = await setAccess(s, p.email, action === 'on')
    if (!r.ok) { failed.push({ ...who, error: r.error }); continue }
    const what = action === 'send' ? (r.sent === 'invite' ? 'invite sent' : 'password reset sent') : action === 'off' ? 'sign-in turned off' : action === 'on' ? 'sign-in turned on' : 'two-step sign-in removed'
    done.push({ ...who, result: what })
    await s.from('audit_logs').insert({ user_id: admin.personId, action: `account_${action === 'send' ? r.sent : action}`, details: p.email, ip_address: getClientIp(req.headers) })
  }
  return NextResponse.json({ done, failed })
}
