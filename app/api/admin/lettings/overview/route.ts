/**
 * /api/admin/lettings/overview — the whole letting flow on one screen (Lettings home, /admin/lettings).
 *   GET → { applicants, letAgreed, onNotice, counts }
 *   Applicants still in progress → lets agreed (with how far each is to move-in) → on notice (rooms coming up).
 * Read-only; every card links to the applicant or its letting file. Office and lettings staff.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const personName = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email || '') : ''
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0]

const ACTIVE_APPLICANT = ['applied', 'offer_sent', 'referencing', 'referencing_passed', 'docs_uploaded']

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const today = todayIso()

  const [{ data: apps, error: aErr }, { data: tens, error: tErr }, { count: availableNow }] = await Promise.all([
    s.from('applicants').select('id, full_name, email, pipeline_stage, created_at, submitted_at, rooms(name), properties(name, address, property_code)')
      .in('pipeline_stage', ACTIVE_APPLICANT).order('created_at', { ascending: false }),
    s.from('tenancies').select('*, people!person_id(first_name, last_name, full_name, email), rooms(name, status), properties(name, address, property_code)')
      .is('let_cancelled_at', null).or(`end_date.is.null,end_date.gte.${today}`),
    s.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'available'),
  ])
  if (aErr || tErr) return NextResponse.json({ error: (aErr ?? tErr)!.message }, { status: 500 })

  const all = (tens ?? []) as any[]
  const agreed = all.filter(t => t.start_date && t.start_date > today)
  const live = all.filter(t => !t.start_date || t.start_date <= today)
  const notice = live.filter(t => t.notice_received_date || t.rooms?.status === 'on_notice')

  // holding deposits for the lets agreed (held or applied — not refunded, retained or reversed)
  const ids = agreed.map(t => t.id)
  const { data: holds } = ids.length
    ? await s.from('holding_deposits').select('tenancy_id, amount, status, received_on').in('tenancy_id', ids).in('status', ['held', 'applied'])
    : { data: [] as any[] }
  const holdFor = new Map(((holds ?? []) as any[]).map(h => [h.tenancy_id, h]))

  const where = (t: any) => ({ room: t.rooms?.name ?? '', property: firstLine(t.properties?.name || t.properties?.address), code: t.properties?.property_code ?? null })

  const letAgreed = agreed.map(t => {
    const hold = holdFor.get(t.id)
    const steps: [string, boolean][] = [
      ['Holding deposit', !!hold],
      ['Referencing', !!t.referencing_passed_at],
      ['Right to Rent', !!t.right_to_rent_checked_at],
      ['Agreement signed', !!t.agreement_signed_at],
      ['Move-in monies', !!t.move_in_monies_received_at],
      ['Deposit protected', !!t.deposit_protected_at],
      ['Keys & check-in', !!t.keys_handed_at],
    ]
    const next = steps.find(([, done]) => !done)?.[0] ?? 'Move in'
    // the agreement should be signed within 15 days of the holding deposit
    const signBy = hold?.received_on && !t.agreement_signed_at ? addDays(hold.received_on, 15) : null
    return {
      id: t.id, tenant: personName(t.people), email: t.people?.email ?? null, ...where(t),
      startDate: t.start_date, rent: t.rent_amount, done: steps.filter(([, d]) => d).length, total: steps.length, next,
      signBy, signLate: !!signBy && signBy < today, soon: t.start_date <= addDays(today, 14),
    }
  }).sort((a, b) => a.startDate.localeCompare(b.startDate))

  const onNotice = notice.map(t => {
    const incoming = agreed.find(a => a.room_id === t.room_id)
    return { id: t.id, tenant: personName(t.people), ...where(t), endDate: t.end_date, relet: incoming ? { id: incoming.id, tenant: personName(incoming.people), startDate: incoming.start_date } : null }
  }).sort((a, b) => String(a.endDate ?? '9999').localeCompare(String(b.endDate ?? '9999')))

  // newest first — the order they came in
  const applicants = ((apps ?? []) as any[]).map(a => ({
    id: a.id, name: a.full_name, email: a.email, stage: a.pipeline_stage, at: (a.submitted_at ?? a.created_at)?.slice(0, 10) ?? null,
    room: a.rooms?.name ?? '', property: firstLine(a.properties?.name || a.properties?.address),
  }))

  return NextResponse.json({
    applicants,
    letAgreed,
    onNotice,
    counts: { applicants: applicants.length, letAgreed: letAgreed.length, live: live.length, onNotice: onNotice.length, availableNow: availableNow ?? 0 },
  })
}
