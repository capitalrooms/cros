// GET /api/admin/arrears — every tenancy with rent owed, worst first.
// For each: total owed, how many months' rent that is, the date they've been in arrears since (the due date
// of the oldest unpaid charge), and a level:
//   legal       ≥ 3 months' rent owed — the Ground 8 threshold (get advice before serving notice)
//   approaching ≥ 2 months' rent owed
//   watch       anything less
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { demoPropertyIds } from '@/lib/demoProperties'
import { ledgerStart } from '@/lib/clientLedger'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface ArrearsRow {
  key: string
  tenancyId: string | null
  personId: string | null
  tenant: string
  phone: string | null
  email: string | null
  room: string
  property: string
  propertyId: string | null
  monthlyRent: number
  owed: number
  monthsOwed: number
  since: string            // YYYY-MM-DD — due date of the oldest unpaid charge
  days: number
  level: 'legal' | 'approaching' | 'watch'
  onNotice: boolean
  latestChargeId: string   // for the arrears letter
  charges: { id: string; month: string; due: number; received: number; status: string }[]
  lastAction?: { action: string; note: string | null; at: string; promisedDate: string | null; promisedAmount: number | null } | null
  nextStep?: string
}

// The chasing ladder — what should have happened by now, by days since the oldest unpaid rent was due.
export function nextArrearsStep(days: number, monthsOwed: number): string {
  if (monthsOwed >= 3) return 'Three months owed — take advice on Ground 8 possession'
  if (monthsOwed >= 2) return 'Two months owed — final letter, offer a payment plan, prepare for possession'
  if (days >= 28) return 'Final letter before action and a phone call'
  if (days >= 14) return 'Second arrears letter and a phone call'
  if (days >= 7) return 'First arrears letter'
  return 'Friendly reminder (text or email)'
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: charges, error } = await s.from('rent_charges')
    .select('id, room_id, property_id, charge_month, amount_due, amount_received, status, voided, rooms(name), properties(name, address)')
    .in('status', ['overdue', 'partial']).gte('charge_month', await ledgerStart(s)).order('charge_month')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const demo = await demoPropertyIds(s)
  const open = (charges ?? []).filter((c: any) => !c.voided && !demo.has(c.property_id) && Number(c.amount_due) > Number(c.amount_received || 0))

  const roomIds = [...new Set(open.map((c: any) => c.room_id).filter(Boolean))]
  const { data: tenancies } = roomIds.length
    ? await s.from('tenancies').select('id, room_id, start_date, end_date, rent_amount, rent_due_day, notice_received_date, person_id, people!person_id(id, first_name, last_name, full_name, phone, email)').in('room_id', roomIds)
    : { data: [] as any[] }

  const tenancyFor = (roomId: string, month: string) => {
    const [y, m] = month.split('-').map(Number)
    const start = `${month.slice(0, 7)}-01`, end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    return ((tenancies ?? []) as any[])
      .filter(t => t.room_id === roomId && (!t.start_date || t.start_date <= end) && (!t.end_date || t.end_date >= start))
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0] ?? null
  }

  const groups = new Map<string, ArrearsRow>()
  const today = new Date().toISOString().slice(0, 10)
  for (const c of open as any[]) {
    const month = String(c.charge_month).slice(0, 10)
    const t = tenancyFor(c.room_id, month)
    const key = t?.id ?? `room-${c.room_id}`
    const p = t?.people
    const dueDay = Math.min(Math.max(Number(t?.rent_due_day) || 1, 1), 28)
    const dueDate = `${month.slice(0, 7)}-${String(dueDay).padStart(2, '0')}`
    const g: ArrearsRow = groups.get(key) ?? {
      key, tenancyId: t?.id ?? null, personId: p?.id ?? null,
      tenant: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || 'Unknown tenant',
      phone: p?.phone ?? null, email: p?.email ?? null,
      room: c.rooms?.name ?? '', property: c.properties?.name || c.properties?.address || '', propertyId: c.property_id ?? null,
      monthlyRent: Number(t?.rent_amount || c.amount_due || 0),
      owed: 0, monthsOwed: 0, since: dueDate, days: 0, level: 'watch',
      onNotice: !!t?.notice_received_date, latestChargeId: c.id, charges: [],
    }
    g.owed = r2(g.owed + Number(c.amount_due) - Number(c.amount_received || 0))
    if (dueDate < g.since) g.since = dueDate
    g.latestChargeId = c.id        // ordered by month, so the last one wins
    g.charges.push({ id: c.id, month, due: Number(c.amount_due), received: Number(c.amount_received || 0), status: c.status })
    groups.set(key, g)
  }

  const rows = [...groups.values()].map(g => {
    const monthsOwed = g.monthlyRent ? Math.round((g.owed / g.monthlyRent) * 10) / 10 : 0
    const days = Math.max(0, Math.round((new Date(today).getTime() - new Date(g.since).getTime()) / 86_400_000))
    const level: ArrearsRow['level'] = monthsOwed >= 3 ? 'legal' : monthsOwed >= 2 ? 'approaching' : 'watch'
    return { ...g, monthsOwed, days, level }
  }).sort((a, b) => b.monthsOwed - a.monthsOwed || b.owed - a.owed)

  // Last contact for each tenancy (arrears_actions — migration 189; empty until it's run)
  const tIds = rows.map(r => r.tenancyId).filter(Boolean) as string[]
  const acts = tIds.length ? await s.from('arrears_actions').select('tenancy_id, action, note, promised_date, promised_amount, created_at').in('tenancy_id', tIds).order('created_at', { ascending: false }) : { data: [], error: null }
  for (const r of rows) {
    const a = ((acts.data ?? []) as any[]).find(x => x.tenancy_id === r.tenancyId)
    r.lastAction = a ? { action: a.action, note: a.note, at: a.created_at, promisedDate: a.promised_date, promisedAmount: a.promised_amount != null ? Number(a.promised_amount) : null } : null
    r.nextStep = nextArrearsStep(r.days, r.monthsOwed)
  }

  return NextResponse.json({
    contactLogReady: !acts.error,
    rows,
    totals: { owed: r2(rows.reduce((t, r) => t + r.owed, 0)), tenants: rows.length, legal: rows.filter(r => r.level === 'legal').length, approaching: rows.filter(r => r.level === 'approaching').length },
  })
}
