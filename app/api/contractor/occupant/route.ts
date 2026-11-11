// GET /api/contractor/occupant?jobId= — the first name(s) of whoever lives in the job's room on the visit day, so the
// contractor can greet them (11 Nov 2026, Harry: "make sure there is no way they will get the wrong name from old
// tenants who have left").
//
// Never stored on the job: worked out from the tenancies every time the job is opened, for the booked day (or today
// if not booked yet). A name is only given when exactly one tenancy covers that whole day:
//   • started on or before the day, not cancelled, and not ending on or before it (end or termination date) —
//     so a tenant who has left, or is moving out that day, is never named;
//   • if two tenancies touch the day (a changeover), or none does, no name at all — "the tenant" is safer than wrong.
// First names only (the tenant and any joint tenant); shared areas and finished jobs get none. Only the office and
// the contractor the job is assigned to can ask.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const jobId = req.nextUrl.searchParams.get('jobId') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ names: null })
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: t } = await s.from('maintenance_tickets').select('room_id, contractor_id, booked_date, status').eq('id', jobId).maybeSingle() as { data: any }
  if (!t) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (!(isStaff(c) || (c.role === 'contractor' && t.contractor_id === c.personId))) return NextResponse.json({ names: null })
  if (!t.room_id || ['completed', 'cancelled'].includes(String(t.status))) return NextResponse.json({ names: null })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const day: string = t.booked_date && t.booked_date >= today ? t.booked_date : today
  const { data: rows } = await s.from('tenancies')
    .select('person_id, co_tenant_id, start_date, end_date, termination_date')
    .eq('room_id', t.room_id).is('let_cancelled_at', null).lte('start_date', day) as { data: any[] | null }
  // every tenancy that touches the day — ending ON the day counts as touching (they may be moving out)
  const touching = (rows ?? []).filter(r => {
    const ends = [r.end_date, r.termination_date].filter(Boolean).sort()[0] as string | undefined
    return !ends || ends >= day
  })
  if (touching.length !== 1) return NextResponse.json({ names: null, day })
  const r = touching[0]
  const ends = [r.end_date, r.termination_date].filter(Boolean).sort()[0] as string | undefined
  if (ends === day) return NextResponse.json({ names: null, day })   // moving out that day: don't guess

  const ids = [r.person_id, r.co_tenant_id].filter(Boolean)
  const { data: people } = await s.from('people').select('id, first_name, role').in('id', ids) as { data: any[] | null }
  const names = ids.map(id => (people ?? []).find(p => p.id === id)).filter(p => p && p.role !== 'inactive' && p.first_name?.trim())
    .map(p => String(p.first_name).trim().split(/\s+/)[0])
  return NextResponse.json({ names: names.length ? names : null, day })
}
