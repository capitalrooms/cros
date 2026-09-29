// GET /api/admin/money — the phone Money tab: rent collected vs due, arrears, empty rooms, open jobs, certificates.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { PROPERTY_CERTIFICATES } from '@/lib/propertyCertificates'
import { demoPropertyIds } from '@/lib/demoProperties'
import { ledgerStart } from '@/lib/clientLedger'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
const CLOSED = ['completed', 'closed', 'cancelled', 'resolved']
const CERTS = PROPERTY_CERTIFICATES.map(([c]) => c)

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
  const from = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)))
  const thisMonth = monthStart(now)
  const start = await ledgerStart(s)   // arrears only count from when CROS took over collecting rent

  const [charges, arrears, rooms, lets, jobs, props] = await Promise.all([
    s.from('rent_charges').select('property_id, charge_month, amount_due, amount_received, voided').gte('charge_month', from),
    s.from('rent_charges').select('property_id, amount_due, amount_received, charge_month, voided').in('status', ['overdue', 'partial']).gte('charge_month', start),
    s.from('rooms').select('id, property_id, status'),
    s.from('tenancies').select('room_id').lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`),
    s.from('maintenance_tickets').select('id, property_id, status, approved_at, on_hold').not('status', 'in', `(${CLOSED.join(',')})`),
    s.from('properties').select(['id', ...CERTS].join(', ')),
  ])
  const failed = [charges, arrears, rooms, lets, jobs, props].find(r => r.error)
  if (failed) return NextResponse.json({ error: failed.error!.message }, { status: 500 })

  // Demo/test properties never count towards real figures
  const demo = await demoPropertyIds(s)
  const real = <T extends { property_id?: string | null }>(rows: T[] | null) => (rows ?? []).filter(r => !demo.has(r.property_id ?? ''))

  // Last six months, oldest first
  const months: { month: string; due: number; received: number }[] = []
  for (let i = 5; i >= 0; i--) months.push({ month: monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))), due: 0, received: 0 })
  for (const c of real(charges.data as any[])) {
    if (c.voided) continue
    const m = months.find(x => x.month === String(c.charge_month).slice(0, 10))
    if (m) { m.due += Number(c.amount_due || 0); m.received += Number(c.amount_received || 0) }
  }

  const owed = real(arrears.data as any[]).filter((c: any) => !c.voided)
  const oldest = owed.map((c: any) => String(c.charge_month)).sort()[0] ?? null
  // Empty = no current tenancy and not marked let. Rooms marked let with no tenancy on record are a data gap
  // (they're missing from the rent roll), reported separately rather than counted as empty.
  const letRooms = new Set((lets.data ?? []).map((t: any) => t.room_id))
  const realRooms = real(rooms.data as any[])
  const occupied = realRooms.filter(r => letRooms.has(r.id)).length
  const noTenancy = realRooms.filter(r => !letRooms.has(r.id) && r.status === 'occupied').length
  const empty = realRooms.length - occupied - noTenancy
  const openJobs = real(jobs.data as any[])
  let expired = 0, dueSoon = 0
  for (const p of (props.data ?? []) as any[]) if (!demo.has(p.id)) for (const col of CERTS) {
    const d = p[col] as string | null
    if (!d) continue
    if (d < today) expired++
    else if (d <= in30) dueSoon++
  }

  return NextResponse.json({
    month: thisMonth,
    months,
    arrears: { total: owed.reduce((t: number, c: any) => t + Number(c.amount_due || 0) - Number(c.amount_received || 0), 0), count: owed.length, oldest },
    rooms: { total: realRooms.length, occupied, empty, noTenancy },
    jobs: { open: openJobs.length, toApprove: openJobs.filter(j => j.status === 'reported' && !j.approved_at && !j.on_hold).length },
    certificates: { expired, dueSoon },
  })
}
