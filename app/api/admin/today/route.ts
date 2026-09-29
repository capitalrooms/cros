// GET /api/admin/today — everything that needs the admin's attention, for the phone "Today" screen.
// One request so the phone loads fast. Items are ordered: needs you (urgent first) → later today → coming up.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { PROPERTY_CERTIFICATES } from '@/lib/propertyCertificates'
import { demoPropertyIds } from '@/lib/demoProperties'
import { ledgerStart } from '@/lib/clientLedger'

export const dynamic = 'force-dynamic'

export interface TodayItem {
  id: string
  kind: 'job_approve' | 'quote_review' | 'rent_overdue' | 'aml_review' | 'viewing' | 'appointment' | 'certificate' | 'move_out'
  group: 'needs_you' | 'today' | 'coming_up'
  title: string
  detail: string
  tag?: { text: string; tone: 'red' | 'amber' | 'green' | 'grey' }
  href: string
  rank: number                 // lower = higher on the list
  chargeId?: string            // rent: for one-tap "Mark paid"
  amount?: number
  phone?: string | null        // for a one-tap call
}

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const iso = (d: Date) => d.toISOString().slice(0, 10)
const days = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000)
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ago = (ts: string) => {
  const h = Math.round((Date.now() - new Date(ts).getTime()) / 3_600_000)
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}
const where = (room?: { name?: string } | null, prop?: { name?: string; address?: string } | null) =>
  [room?.name, prop?.name || prop?.address].filter(Boolean).join(', ')

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const now = new Date()
  const today = iso(now)
  const in30 = iso(new Date(now.getTime() + 30 * 86_400_000))
  const in14 = iso(new Date(now.getTime() + 14 * 86_400_000))
  const items: TodayItem[] = []
  const start = await ledgerStart(s)   // before this, the previous agent collected rent — not our arrears

  const [jobs, quotes, charges, onboarding, viewings, appts, props, moveOuts, multiQuotes] = await Promise.all([
    s.from('maintenance_tickets').select('id, title, priority, created_at, room_id, rooms(name), properties(name, address)')
      .eq('status', 'reported').is('approved_at', null).or('on_hold.is.null,on_hold.eq.false').order('created_at', { ascending: true }),
    s.from('maintenance_tickets').select('id, title, quote_amount, quote_submitted_at, rooms(name), properties(name, address)')
      .eq('quote_requested', true).not('quote_submitted_at', 'is', null).in('status', ['reported', 'assigned']),
    s.from('rent_charges').select('id, room_id, property_id, charge_month, amount_due, amount_received, status, voided, rooms(name, properties(name, address))')
      .in('status', ['overdue', 'partial']).gte('charge_month', start).order('charge_month', { ascending: true }).limit(20),
    s.from('landlord_onboarding').select('id, full_name, updated_at').eq('stage', 3),
    s.from('viewings').select('id, viewing_date, viewing_slot, visitor_name, visitor_phone, rooms(name), properties(name, address)')
      .eq('viewing_date', today).neq('viewing_status', 'cancelled').order('viewing_slot'),
    s.from('admin_appointments').select('id, title, appointment_date, appointment_time, properties(name)').eq('appointment_date', today).order('appointment_time'),
    s.from('properties').select(['id', 'name', 'address', ...PROPERTY_CERTIFICATES.map(([c]) => c)].join(', ')),
    s.from('tenancies').select('id, end_date, person_id, rooms(name), properties(name, address), people!person_id(first_name, last_name, full_name)')
      .not('notice_received_date', 'is', null).gte('end_date', today).lte('end_date', in14),
    // Prices back from the multi-contractor quote requests (table from migration 184 — empty until it's run)
    s.from('maintenance_quotes').select('ticket_id, amount, maintenance_tickets(id, title, rooms(name), properties(name, address))').eq('status', 'submitted'),
  ])

  const pr = (p: string | null) => (p === 'urgent' ? 0 : p === 'high' ? 1 : 2)
  for (const j of (jobs.data ?? []) as any[]) {
    items.push({
      id: `job-${j.id}`, kind: 'job_approve', group: 'needs_you', rank: 10 + pr(j.priority),
      title: j.title || 'Maintenance job', detail: `${where(j.rooms, j.properties)} · reported ${ago(j.created_at)}`,
      tag: { text: j.priority || 'medium', tone: j.priority === 'high' || j.priority === 'urgent' ? 'red' : 'grey' },
      href: `/admin/maintenance?ticket=${j.id}`,
    })
  }
  for (const q of (quotes.data ?? []) as any[]) {
    items.push({
      id: `quote-${q.id}`, kind: 'quote_review', group: 'needs_you', rank: 15,
      title: `Quote in · ${q.title || 'job'}`, detail: `${where(q.rooms, q.properties)}${q.quote_amount ? ` · ${gbp(Number(q.quote_amount))}` : ''}`,
      tag: { text: 'Quote', tone: 'amber' }, href: `/admin/maintenance?ticket=${q.id}`,
    })
  }
  const byTicket = new Map<string, { t: any; amounts: number[]; n: number }>()
  for (const q of (multiQuotes.error ? [] : multiQuotes.data ?? []) as any[]) {
    if (!q.maintenance_tickets) continue
    const g = byTicket.get(q.ticket_id) ?? { t: q.maintenance_tickets, amounts: [], n: 0 }
    g.n++; if (q.amount != null) g.amounts.push(Number(q.amount))
    byTicket.set(q.ticket_id, g)
  }
  for (const [id, g] of byTicket) {
    if (items.some(i => i.id === `quote-${id}`)) continue
    items.push({
      id: `quote-${id}`, kind: 'quote_review', group: 'needs_you', rank: 15,
      title: `${g.n} quote${g.n === 1 ? '' : 's'} in · ${g.t.title || 'job'}`,
      detail: `${where(g.t.rooms, g.t.properties)}${g.amounts.length ? ` · from ${gbp(Math.min(...g.amounts))}` : ''}`,
      tag: { text: 'Quotes', tone: 'amber' }, href: `/admin/maintenance?ticket=${id}`,
    })
  }
  const demo = await demoPropertyIds(s)
  for (const c of (charges.data ?? []) as any[]) {
    if (demo.has(c.property_id) || c.voided) continue
    const owed = Number(c.amount_due) - Number(c.amount_received || 0)
    const late = days(c.charge_month, today)
    items.push({
      id: `rent-${c.id}`, kind: 'rent_overdue', group: 'needs_you', rank: 20,
      title: `Rent ${c.status === 'partial' ? 'part paid' : 'overdue'} · ${gbp(owed)}`, detail: where(c.rooms, c.rooms?.properties),
      tag: { text: `${late} days`, tone: late > 30 ? 'red' : 'amber' },
      href: `/admin/arrears`, chargeId: c.id, amount: owed,   // what's still outstanding — the pay route adds it to what's been received
    })
  }
  for (const o of (onboarding.data ?? []) as any[]) {
    items.push({
      id: `aml-${o.id}`, kind: 'aml_review', group: 'needs_you', rank: 30,
      title: 'Landlord form to review', detail: `${o.full_name || 'New landlord'} · submitted ${ago(o.updated_at)}`,
      tag: { text: 'AML', tone: 'grey' }, href: `/admin/new-business/onboarding/${o.id}`,
    })
  }
  for (const v of (viewings.data ?? []) as any[]) {
    items.push({
      id: `view-${v.id}`, kind: 'viewing', group: 'today', rank: 50,
      title: `Viewing${v.viewing_slot ? ` · ${v.viewing_slot}` : ''}`, detail: `${where(v.rooms, v.properties)}${v.visitor_name ? ` · ${v.visitor_name}` : ''}`,
      tag: { text: 'Today', tone: 'green' }, href: `/admin/appointments`, phone: v.visitor_phone,
    })
  }
  for (const a of (appts.data ?? []) as any[]) {
    items.push({
      id: `appt-${a.id}`, kind: 'appointment', group: 'today', rank: 51,
      title: `${a.title || 'Appointment'}${a.appointment_time ? ` · ${String(a.appointment_time).slice(0, 5)}` : ''}`,
      detail: a.properties?.name || '', tag: { text: 'Today', tone: 'green' }, href: `/admin/appointments`,
    })
  }
  for (const p of (props.data ?? []) as any[]) {
    if (demo.has(p.id)) continue
    for (const [col, label] of PROPERTY_CERTIFICATES) {
      const d = p[col] as string | null
      if (!d || d > in30) continue
      const left = days(today, d)
      items.push({
        id: `cert-${p.id}-${col}`, kind: 'certificate', group: left < 0 ? 'needs_you' : 'coming_up', rank: left < 0 ? 5 : 70 + left / 100,
        title: `${label} ${left < 0 ? 'expired' : 'due'}`, detail: `${p.name || p.address} · ${left < 0 ? `${-left} days ago` : `in ${left} days`}`,
        tag: { text: left < 0 ? 'Expired' : `${left}d`, tone: left < 0 ? 'red' : 'amber' }, href: `/admin/compliance?tab=certificates`,
      })
    }
  }
  for (const t of (moveOuts.data ?? []) as any[]) {
    const who = [t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ') || t.people?.full_name || 'Tenant'
    const left = days(today, t.end_date)
    items.push({
      id: `move-${t.id}`, kind: 'move_out', group: 'coming_up', rank: 80 + left / 100,
      title: `Move-out · ${who}`, detail: `${where(t.rooms, t.properties)} · in ${left} day${left === 1 ? '' : 's'}`,
      tag: { text: `${left}d`, tone: 'grey' }, href: `/admin/tenancy-management`,
    })
  }

  items.sort((a, b) => a.rank - b.rank)
  return NextResponse.json({ date: today, items })
}
