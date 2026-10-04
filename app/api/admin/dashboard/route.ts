// GET /api/admin/dashboard — the desktop dashboard's figures in one request: rooms, rent, tenancy ends,
// lettings, repairs, deposits, certificates and what's waiting. Managed houses only (let-only and demo left out).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { PROPERTY_CERTIFICATES } from '@/lib/propertyCertificates'
import { ledgerStart } from '@/lib/clientLedger'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { loadVoids, VOID_WINDOWS } from '@/lib/voids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const round2 = (n: number) => Math.round(n * 100) / 100

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const today = londonToday()
  const month = `${today.slice(0, 7)}-01`
  const in30 = addDays(today, 30), in7 = addDays(today, 7)

  const [propsR, roomsR, tenR, chargesR, appsR, viewsR, jobsR, holdR, start, voidsAll] = await Promise.all([
    s.from('properties').select(['id', 'name', 'address', 'letting_type', 'is_demo', 'landlord_id', 'has_gas', ...PROPERTY_CERTIFICATES.map(([c]) => c)].join(', ')),
    s.from('rooms').select('id, property_id, name, status, is_let_only'),
    s.from('tenancies').select('id, room_id, property_id, start_date, end_date, notice_received_date, let_cancelled_at, rent_amount, deposit_amount, deposit_protected_at, deposit_protection_assumed, prescribed_info_served_at, last_rent_change_date, is_periodic'),
    s.from('rent_charges').select('property_id, charge_month, amount_due, amount_received, status, voided'),
    s.from('applicants').select('pipeline_stage'),
    s.from('viewings').select('viewing_date, viewing_status').gte('viewing_date', today).lte('viewing_date', in7),
    s.from('maintenance_tickets').select('status, approved_at, on_hold, booked_date, created_at, completed_at'),
    s.from('holding_deposits').select('status, amount'),
    ledgerStart(s),
    loadVoids(s, today).catch(() => null),
  ]) as any[]
  const err = [propsR, roomsR, tenR].find(r => r.error)
  if (err) return NextResponse.json({ error: err.error.message }, { status: 500 })

  const allProps = (propsR.data ?? []) as any[]
  const live = allProps.filter(p => !p.is_demo)
  const managed = sortPropertiesNumerically(live.filter(p => p.letting_type !== 'let_only'))
  const mid = new Set(managed.map(p => p.id))
  const rooms = ((roomsR.data ?? []) as any[]).filter(r => mid.has(r.property_id) && !r.is_let_only)
  const roomIds = new Set(rooms.map(r => r.id))
  const propName = new Map(managed.map(p => [p.id, firstLine(p.name || p.address).replace(/,.*$/, '')]))

  // ── Rooms ──
  const isLet = (r: any) => r.status === 'occupied'
  const isNotice = (r: any) => r.status === 'on_notice'
  const isEmpty = (r: any) => r.status === 'available'
  const tenancies = ((tenR.data ?? []) as any[]).filter(t => !t.let_cancelled_at)
  const current = tenancies.filter(t => roomIds.has(t.room_id) && (!t.start_date || t.start_date <= today) && (!t.end_date || t.end_date >= today))
  const byHouse = managed.map(p => {
    const rs = rooms.filter(r => r.property_id === p.id)
    return { id: p.id, name: propName.get(p.id)!, let: rs.filter(isLet).length, notice: rs.filter(isNotice).length, empty: rs.filter(isEmpty).length, other: rs.filter(r => !isLet(r) && !isNotice(r) && !isEmpty(r)).length }
  }).filter(h => h.let + h.notice + h.empty + h.other > 0)
  const onNotice = rooms.filter(isNotice).map(r => {
    const t = tenancies.filter(x => x.room_id === r.id && (!x.end_date || x.end_date >= today)).sort((a, b) => String(a.end_date ?? '9').localeCompare(String(b.end_date ?? '9')))[0]
    return { room: r.name, house: propName.get(r.property_id) ?? '', leaves: t?.end_date ?? null, noticeRecorded: !!t?.notice_received_date, tenancyId: t?.id ?? null }
  }).sort((a, b) => String(a.leaves ?? '9').localeCompare(String(b.leaves ?? '9')))

  // ── Rent ──
  const rents = current.map(t => Number(t.rent_amount) || 0).filter(n => n > 0).sort((a, b) => a - b)
  const charges = ((chargesR.data ?? []) as any[]).filter(c => mid.has(c.property_id) && !c.voided)
  const thisMonth = charges.filter(c => c.charge_month === month)
  const overdue = charges.filter(c => c.charge_month >= start && c.charge_month < month && (c.status === 'overdue' || c.status === 'partial'))

  // ── Tenancy ends: next three months by calendar month, then later, then rolling ──
  const months = [0, 1, 2].map(i => { const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 + i, 1)); return d.toISOString().slice(0, 7) })
  const ends = [
    ...months.map(m => ({ label: new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), count: current.filter(t => t.end_date?.startsWith(m)).length, noNotice: current.filter(t => t.end_date?.startsWith(m) && !t.notice_received_date).length })),
    { label: 'Later', count: current.filter(t => t.end_date && t.end_date.slice(0, 7) > months[2]).length, noNotice: 0 },
    { label: 'No end', count: current.filter(t => !t.end_date).length, noNotice: 0 },
  ]
  const endNoNotice = current.filter(t => t.end_date && t.end_date <= addDays(today, 60) && !t.notice_received_date && t.is_periodic)

  // ── Lettings ──
  const stages: Record<string, number> = {}
  for (const a of (appsR.data ?? []) as any[]) stages[a.pipeline_stage] = (stages[a.pipeline_stage] ?? 0) + 1
  const movingIn = tenancies.filter(t => roomIds.has(t.room_id) && t.start_date > today && t.start_date <= in30).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const tenure = current.filter(t => t.start_date).map(t => (Date.parse(today) - Date.parse(t.start_date)) / 86400000 / 30.44)

  // ── Repairs ──
  const jobs = (jobsR.data ?? []) as any[]
  const open = jobs.filter(j => !['completed', 'closed', 'cancelled'].includes(j.status))
  const done = jobs.filter(j => j.status === 'completed' && j.completed_at)
  const perMonth = [2, 1, 0].map(i => { const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 - i, 1)).toISOString().slice(0, 7); return { label: new Date(`${d}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), count: jobs.filter(j => j.created_at?.startsWith(d)).length, partial: i === 0 } })

  // ── Deposits ──
  const withDeposit = current.filter(t => Number(t.deposit_amount) > 0)
  const protectedN = withDeposit.filter(t => t.deposit_protected_at || t.deposit_protection_assumed).length
  const held = ((holdR.data ?? []) as any[]).filter(h => h.status === 'held')

  // ── Certificates: every managed house × every type ──
  const in30c = addDays(today, 30)
  const certs = {
    types: PROPERTY_CERTIFICATES.map(([, label]) => label),
    rows: managed.map(p => ({
      id: p.id, name: propName.get(p.id)!,
      cells: PROPERTY_CERTIFICATES.map(([col]) => {
        const d = p[col] as string | null
        if (!d) return col === 'gas_safe_cert_expiry' && p.has_gas === false ? 'na' : 'missing'
        return d < today ? 'expired' : d <= in30c ? 'due' : 'valid'
      }),
    })),
  }
  const flat = certs.rows.flatMap(r => r.cells)

  const repairs = {
    open: open.length,
    toApprove: open.filter(j => j.status === 'reported' && !j.approved_at && !j.on_hold).length,
    needContractor: open.filter(j => j.status === 'reported' && j.approved_at && !j.on_hold).length,
    visitPassed: open.filter(j => j.status === 'assigned' && j.booked_date && j.booked_date < today).length,
    bookedAhead: open.filter(j => j.status === 'assigned' && j.booked_date && j.booked_date >= today).length,
    waitingDate: open.filter(j => j.status === 'assigned' && !j.booked_date).length,
    inProgress: open.filter(j => j.status === 'in_progress').length,
    held: open.filter(j => j.on_hold).length,
    perMonth,
    avgDaysToFix: done.length ? Math.round(sum(done.map(j => (Date.parse(j.completed_at) - Date.parse(j.created_at)) / 86400000)) / done.length) : null,
    finished: done.length,
  }

  const waiting = [
    { label: 'Tenancy end dates to sort', count: endNoNotice.length, href: '/admin/finance-check', bad: true },
    { label: 'Deposits not protected', count: withDeposit.length - protectedN, href: '/admin/deposits', bad: true },
    { label: 'Visits to sign off', count: repairs.visitPassed, href: '/admin/maintenance', bad: true },
    { label: 'Certificates expired', count: flat.filter(c => c === 'expired').length, href: '/admin/compliance?tab=certificates', bad: true },
    { label: 'Jobs to approve', count: repairs.toApprove, href: '/admin/maintenance', bad: false },
    { label: 'Jobs needing a contractor', count: repairs.needContractor, href: '/admin/maintenance', bad: false },
    { label: 'Rent overdue', count: overdue.length, href: '/admin/arrears', bad: false },
    { label: 'Notice dates missing', count: onNotice.filter(n => !n.noticeRecorded).length, href: '/admin/tenancies', bad: false },
    { label: 'Applicants in progress', count: (stages.applied ?? 0) + (stages.offer_sent ?? 0) + (stages.referencing ?? 0) + (stages.ref_passed ?? 0) + (stages.docs_uploaded ?? 0), href: '/admin/applicants', bad: false },
  ].filter(w => w.count > 0).sort((a, b) => Number(b.bad) - Number(a.bad) || b.count - a.count)

  return NextResponse.json({
    today,
    portfolio: { managed: managed.length, letOnly: live.length - managed.length, landlords: new Set(managed.map(p => p.landlord_id).filter(Boolean)).size },
    rooms: { total: rooms.length, let: rooms.filter(isLet).length, notice: rooms.filter(isNotice).length, empty: rooms.filter(isEmpty).length, byHouse, onNotice },
    rent: {
      roll: round2(sum(current.map(t => Number(t.rent_amount) || 0))),
      monthDue: round2(sum(thisMonth.map(c => Number(c.amount_due) || 0))), monthIn: round2(sum(thisMonth.map(c => Number(c.amount_received) || 0))),
      overdueAmount: round2(sum(overdue.map(c => Number(c.amount_due) - Number(c.amount_received || 0)))), overdueCount: overdue.length,
      min: rents[0] ?? null, max: rents.at(-1) ?? null, median: rents.length ? rents[Math.floor(rents.length / 2)] : null, average: rents.length ? Math.round(sum(rents) / rents.length) : null,
      increasesOnRecord: current.filter(t => t.last_rent_change_date).length, tenancies: current.length,
    },
    ends: { buckets: ends, noNoticeSoon: endNoNotice.length },
    lettings: {
      toFill: rooms.filter(isEmpty).length + rooms.filter(isNotice).length,
      applied: stages.applied ?? 0, offerSent: stages.offer_sent ?? 0, referencing: (stages.referencing ?? 0) + (stages.ref_passed ?? 0) + (stages.docs_uploaded ?? 0),
      movingIn: movingIn.length, nextMoveIn: movingIn[0]?.start_date ?? null,
      viewingsNext7: ((viewsR.data ?? []) as any[]).filter(v => v.viewing_status !== 'cancelled').length,
      avgStayMonths: tenure.length ? Math.round(sum(tenure) / tenure.length * 10) / 10 : null,
    },
    repairs,
    deposits: { withDeposit: withDeposit.length, protected: protectedN, prescribed: withDeposit.filter(t => t.prescribed_info_served_at).length, holdingHeld: held.length, holdingAmount: round2(sum(held.map(h => Number(h.amount) || 0))) },
    certs: { ...certs, valid: flat.filter(c => c === 'valid').length, due: flat.filter(c => c === 'due').length, expired: flat.filter(c => c === 'expired').length, missing: flat.filter(c => c === 'missing').length },
    waiting,
    voids: voidsAll ? {
      avgDaysToRelet: voidsAll.avgDaysToRelet, checks: voidsAll.checks.length,
      windows: Object.fromEntries(VOID_WINDOWS.map(m => { const x = voidsAll.summary[m]; return [m, { rate: x.rate, lost: x.lost, emptyDays: x.emptyDays, fullyOnRecord: x.fullyOnRecord, rooms: x.rooms, byLandlord: x.byLandlord.map((l: any) => ({ name: l.name, rate: l.rate, lost: l.lost, rooms: l.rooms })) }] })),
    } : null,
  })
}
