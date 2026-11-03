// GET /api/admin/finance-dashboard?month=YYYY-MM — the Finance home tiles (1 Nov 2026, Harry's sketch "Agency accounts
// summary"): ready to pay · rents due · expenses waiting · last statements · import diary · client account.
// Each tile has a count and the short list it opens to. Replication mode: figures mirror the bank imports.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { buildRentRoll } from '@/lib/finance/rentRoll'
import { clientAccountPosition } from '@/lib/finance/clientAccount'
import { demoPropertyIds } from '@/lib/demoProperties'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const first = (v: unknown) => String(v ?? '').split(/\n/)[0].trim()
const london = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7)
  const s = createServiceClient()
  try {
    const [roll, { data: exps }, { data: stmts }, { data: batches }, position] = await Promise.all([
      buildRentRoll(s, month),
      s.from('recharge_expenses').select('id, txn_no, property_id, description, supplier, amount, expense_date, properties(name)').is('included_in_statement_id', null).is('voided_at', null).order('expense_date', { ascending: false }).limit(200),
      s.from('landlord_statements').select('id, statement_reference, statement_date, net_to_landlord, paid_date, approved_at, source, landlord_id, property_id, properties(name), people:landlord_id(salutation, first_name, last_name, full_name, company)').order('statement_date', { ascending: false }).limit(400),
      s.from('bank_import_batches').select('period_from, period_to, imported_at, filename, is_practice').order('imported_at', { ascending: false }).limit(60),
      clientAccountPosition(s).catch(() => null),
    ])

    const ps = roll.properties
    const ready = ps.filter(p => (p.allIn || p.payPart) && p.readyForStatement > 0.005)
      .map(p => ({ id: p.id, name: p.name, landlord: p.landlord, amount: p.readyForStatement, part: !p.allIn }))
    // an active tenancy means rent is due, even when this month's charge was never raised
    const due = ps.flatMap(p => p.rooms.filter(r => r.status === 'missing' || r.status === 'part' || r.status === 'no_charge')
      .map(r => ({ property: p.name, propertyId: p.id, room: r.room, tenant: r.tenant, tenancyId: r.tenancyId, status: r.status, received: r.received, ends: r.ends ?? null,
        owed: r.status === 'no_charge' ? (r.expected ?? 0) : Math.max(0, (r.due ?? 0) - r.received) })))

    // let-only lets (3 Nov 2026, Harry: "it should work this out from properties due to pay including let fee only
    // landlords"): a let-only tenancy that started in the last four months, or starts in the next month, owes its
    // landlord the move-in money less our fee — until that's recorded and paid (lib/finance/initialMonies) it's to do.
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10), until = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10)
    const { data: lo } = await s.from('tenancies').select('id, start_date, rent_amount, deposit_amount, let_cancelled_at, people!person_id(salutation, first_name, last_name), properties!inner(id, name, letting_type, landlord_id)')
      .eq('properties.letting_type', 'let_only').gte('start_date', since).lte('start_date', until).is('let_cancelled_at', null)
    const demo = await demoPropertyIds(s)
    const loRows = ((lo ?? []) as any[]).filter(t => !demo.has(t.properties?.id))
    const { data: ims } = loRows.length ? await s.from('initial_monies').select('tenancy_id, to_landlord, paid_on').in('tenancy_id', loRows.map(t => t.id)).is('voided_at', null) : { data: [] }
    const imBy = new Map(((ims ?? []) as any[]).map(r => [r.tenancy_id, r]))
    const llIds = [...new Set(loRows.map(t => t.properties?.landlord_id).filter(Boolean))]
    const { data: lls } = llIds.length ? await s.from('people').select('id, salutation, first_name, last_name, company').in('id', llIds) : { data: [] }
    const llName = new Map(((lls ?? []) as any[]).map(p => [p.id, [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.company || '']))
    const letOnly = loRows.map(t => {
      const im = imBy.get(t.id) as any
      if (im?.paid_on) return null
      const tenant = [t.people?.salutation, t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ')
      return { tenancyId: t.id, name: first(t.properties?.name), landlord: llName.get(t.properties?.landlord_id) ?? '', tenant, start: t.start_date,
        amount: im ? Number(im.to_landlord || 0) : round(Number(t.rent_amount || 0) + Number(t.deposit_amount || 0)), step: im ? 'pay' : 'record' }
    }).filter(Boolean) as { tenancyId: string; name: string; landlord: string; tenant: string; start: string; amount: number; step: 'pay' | 'record' }[]

    // expenses not yet on a statement, per house
    const byHouse = new Map<string, { propertyId: string; house: string; count: number; total: number }>()
    for (const e of (exps ?? []) as any[]) {
      const k = e.property_id ?? 'none'
      const h = byHouse.get(k) ?? { propertyId: e.property_id, house: first(e.properties?.name) || 'No property', count: 0, total: 0 }
      h.count++; h.total = Math.round((h.total + Number(e.amount || 0)) * 100) / 100
      byHouse.set(k, h)
    }

    // the last statement each house had
    const lastBy = new Map<string, any>()
    for (const st of (stmts ?? []) as any[]) if (st.property_id && !lastBy.has(st.property_id)) lastBy.set(st.property_id, st)
    const last = [...lastBy.values()].map(st => {
      const p = st.people
      return { id: st.id, house: first(st.properties?.name), landlord: p ? ([p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company) : '', reference: st.statement_reference, date: st.statement_date, net: Number(st.net_to_landlord ?? 0), state: st.paid_date ? 'paid' : st.approved_at ? 'approved' : 'draft' }
    }).sort((a, b) => a.house.localeCompare(b.house, undefined, { numeric: true }))

    // import diary: last import, and how far it covers
    const real = ((batches ?? []) as any[]).filter(b => !b.is_practice && b.period_to)
    const lastImport = real[0] ?? null
    const coveredTo = real.map(b => (london(b.imported_at) > b.period_to ? b.period_to : prevDay(b.period_to))).sort().pop() ?? null
    const today = london(new Date().toISOString())
    const daysBehind = coveredTo ? Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${coveredTo}T12:00:00Z`)) / 86_400_000) - 1) : null

    return NextResponse.json({
      month,
      ready: { count: ready.length + letOnly.length, total: round(ready.reduce((n, r) => n + r.amount, 0) + letOnly.filter(l => l.step === 'pay').reduce((n, l) => n + l.amount, 0)), items: ready, letOnly },
      due: { count: due.length, total: round(due.reduce((n, r) => n + r.owed, 0)), items: due, waitingHouses: ps.filter(p => !p.allIn && !p.payPart && p.received > 0.005).length, notRaised: due.filter(r => r.status === 'no_charge').length, paid: ps.reduce((n, p) => n + p.rooms.filter(r => r.status === 'paid' || r.status === 'over').length, 0) },
      expenses: { count: (exps ?? []).length, total: round(((exps ?? []) as any[]).reduce((n, e) => n + Number(e.amount || 0), 0)), houses: [...byHouse.values()].sort((a, b) => b.total - a.total) },
      statements: { items: last },
      imports: { last: lastImport ? { at: lastImport.imported_at, from: lastImport.period_from, to: lastImport.period_to, file: lastImport.filename } : null, coveredTo, daysBehind },
      client: position ? { held: position.cashbook.total, agrees: position.agrees } : null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load' }, { status: 500 })
  }
}

const round = (n: number) => Math.round(n * 100) / 100
const prevDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
