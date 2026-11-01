// The bank calendar (1 Nov 2026, Harry). One month of the client account, day by day:
//   GET ?month=YYYY-MM[&practice=1]
//     → { days: [{ date, lines, in, out, state: 'full'|'part'|'gap'|'future', note, credits: [...] }], balanceBreaks }
//       full   — a file covering that day was imported after the day had ended
//       part   — the only file covering it was imported during that day (anything later that day may be missing)
//       gap    — no imported file covers it
//       credits: every payment in on that day, with what it's matched to, or — for an unmatched one — the applicants
//       whose holding deposit is exactly that amount
//   GET ?q=…  → search: { tenants: [{ name, room, house, tenancyId, months: [{ month, due, paidIn, daysLate, how }], sentence }],
//                         landlords: [{ name, payments: [{ date, amount, reference, property }] }] }
//   POST { action: 'link_holding', transactionId, holdingId } → the bank line is the holding deposit (taken off the queue)
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadDepositContext, holdingAmount } from '@/lib/lettings/holdingDeposit'
import { tenantAccount } from '@/lib/finance/tenantAccount'
import { displayName } from '@/lib/people'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const london = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
const first = (v: unknown) => String(v ?? '').split(/\n|,/)[0].trim()

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q) return NextResponse.json(await search(s, q))

  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Month must be YYYY-MM' }, { status: 400 })
  const practice = req.nextUrl.searchParams.get('practice') === '1'
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const start = `${month}-01`, end = `${month}-${String(last).padStart(2, '0')}`
  const today = london(new Date().toISOString())

  const [{ data: batches, error: bErr }, { data: txns }] = await Promise.all([
    s.from('bank_import_batches').select('*').lte('period_from', end).gte('period_to', start),
    s.from('bank_transactions').select('id, transaction_date, amount, description, extracted_ref, status, matched_rent_charge_id, is_practice, holding_deposit_id, near_duplicate_of').gte('transaction_date', start).lte('transaction_date', end).order('transaction_date'),
  ])
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })
  const bs = ((batches ?? []) as any[]).filter(b => !!b.is_practice === practice && b.period_from && b.period_to)
  const ts = ((txns ?? []) as any[]).filter(t => !!t.is_practice === practice)

  // what each credit is: rent (tenant, room, house) or a holding deposit
  const chargeIds = [...new Set(ts.map(t => t.matched_rent_charge_id).filter(Boolean))]
  const holdIds = [...new Set(ts.map(t => t.holding_deposit_id).filter(Boolean))]
  const [{ data: charges }, { data: holds }] = await Promise.all([
    chargeIds.length ? s.from('rent_charges').select('id, charge_month, tenancy_id, rooms(name, properties(name, address)), tenancies(people!person_id(salutation, first_name, last_name, full_name))').in('id', chargeIds) : Promise.resolve({ data: [] as any[] }),
    holdIds.length ? s.from('holding_deposits').select('id, hold_no, payer_name, applicant_id, tenancy_id').in('id', holdIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const chargeBy = new Map(((charges ?? []) as any[]).map(c => [c.id, c]))
  const holdBy = new Map(((holds ?? []) as any[]).map(h => [h.id, h]))

  // applicants waiting to pay a holding deposit, and how much (one week of the agreed rent)
  const unmatched = ts.filter(t => t.status === 'unmatched')
  let waiting: { applicantId: string; name: string; email: string | null; room: string; house: string; expected: number }[] = []
  if (unmatched.length) {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
    const { data: offers } = await s.from('offers').select('applicant_id, status').gte('sent_at', since).neq('status', 'deposit_paid').not('applicant_id', 'is', null)
    const ids = [...new Set(((offers ?? []) as any[]).map(o => o.applicant_id))].slice(0, 30)
    const ctxs = await Promise.all(ids.map(id => loadDepositContext(s, id).catch(() => null)))
    waiting = ctxs.filter(Boolean).map(c => ({ applicantId: c!.applicant.id, name: c!.applicant.full_name, email: c!.applicant.email, room: c!.roomName, house: c!.propertyName, expected: holdingAmount(c!) ?? 0 })).filter(w => w.expected > 0)
  }

  const days = []
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    const covering = bs.filter(b => b.period_from <= date && date <= b.period_to)
    const fullBy = covering.find(b => london(b.imported_at) > date)
    const partBy = covering.filter(b => london(b.imported_at) === date).sort((a, b) => a.imported_at < b.imported_at ? 1 : -1)[0]
    const counts = covering.map(b => b.day_counts?.[date]).filter(Boolean) as { in: number; out: number }[]
    const inN = counts.length ? Math.max(...counts.map(c => c.in)) : ts.filter(t => t.transaction_date === date).length
    const outN = counts.length ? Math.max(...counts.map(c => c.out)) : 0
    const state = date > today ? 'future' : fullBy ? 'full' : partBy ? 'part' : 'gap'
    const note = state === 'part' ? `Imported at ${time(partBy.imported_at)} that day — anything later is missing until the next import covers it`
      : state === 'gap' ? 'No import covers this day yet' : state === 'full' ? `Covered by ${fullBy.filename ?? 'an import'}` : ''
    const credits = ts.filter(t => t.transaction_date === date).map(t => {
      const c = t.matched_rent_charge_id ? chargeBy.get(t.matched_rent_charge_id) : null
      const h = t.holding_deposit_id ? holdBy.get(t.holding_deposit_id) : null
      const matched = c ? `Rent ${String(c.charge_month).slice(0, 7)} · ${displayName(c.tenancies?.people)} · ${c.rooms?.name ?? ''}, ${first(c.rooms?.properties?.name || c.rooms?.properties?.address)}`
        : h ? `Holding deposit ${h.hold_no ?? ''} · ${h.payer_name}` : null
      const suggestions = t.status === 'unmatched' ? waiting.filter(w => Math.abs(w.expected - Number(t.amount)) < 0.005) : []
      return { id: t.id, amount: Number(t.amount), description: t.description, ref: t.extracted_ref, status: t.status, matched, tenancyId: c?.tenancy_id ?? h?.tenancy_id ?? null, suggestions, nearDuplicate: !!t.near_duplicate_of }
    })
    days.push({ date, lines: inN + outN, in: inN, out: outN, state, note, credits })
  }
  const balanceBreaks = bs.flatMap(b => (b.balance_breaks ?? []) as any[]).filter(x => x.before >= start && x.after <= end)
  return NextResponse.json({ month, days, balanceBreaks, account: 'Client account' })
}

async function search(s: ReturnType<typeof createServiceClient>, q: string) {
  const term = q.replace(/[%,()]/g, ' ').trim()
  const like = `%${term}%`
  const [{ data: people }, { data: refs }] = await Promise.all([
    s.from('people').select('id, salutation, first_name, last_name, full_name, company, role').or(`full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like}`).in('role', ['tenant', 'landlord', 'former_tenant']).limit(12),
    s.from('tenancies').select('id').ilike('payment_reference', like).limit(5),
  ])
  const ps = (people ?? []) as any[]
  const tenantIds = ps.filter(p => p.role !== 'landlord').map(p => p.id)
  const { data: tens } = await s.from('tenancies').select('id, start_date, person_id').is('let_cancelled_at', null)
    .or([tenantIds.length ? `person_id.in.(${tenantIds.join(',')})` : '', ((refs ?? []) as any[]).length ? `id.in.(${((refs ?? []) as any[]).map(r => r.id).join(',')})` : ''].filter(Boolean).join(',') || 'id.is.null')
    .order('start_date', { ascending: false }).limit(6)
  const tenants = (await Promise.all(((tens ?? []) as any[]).map(t => tenantAccount(s, t.id).then(a => a && ({
    tenancyId: t.id, name: a.tenant, room: a.room, house: first(a.property), ref: a.paymentRef, sentence: a.punctuality.sentence,
    months: a.months.slice(-12).reverse().map(m => ({ month: m.month, due: m.due, amount: m.amount, paidIn: m.paidIn, daysLate: m.daysLate, how: m.how })),
  })).catch(() => null)))).filter(Boolean)

  const landlordIds = ps.filter(p => p.role === 'landlord').map(p => p.id)
  const { data: pays } = landlordIds.length
    ? await s.from('landlord_statements').select('landlord_id, statement_reference, paid_date, amount_paid, net_to_landlord, properties(name, address)').in('landlord_id', landlordIds).not('paid_date', 'is', null).order('paid_date', { ascending: false }).limit(60)
    : { data: [] as any[] }
  const landlords = ps.filter(p => p.role === 'landlord').map(p => ({
    name: displayName(p) || p.company,
    payments: ((pays ?? []) as any[]).filter(x => x.landlord_id === p.id).map(x => ({ date: x.paid_date, amount: Number(x.amount_paid ?? x.net_to_landlord ?? 0), reference: x.statement_reference, property: first(x.properties?.name || x.properties?.address) })),
  }))
  return { tenants, landlords }
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'link_holding') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const s = createServiceClient()
  const { data, error } = await s.from('bank_transactions').update({ status: 'ignored', holding_deposit_id: b.holdingId, matched_at: new Date().toISOString(), matched_by: caller.personId })
    .eq('id', String(b.transactionId ?? '')).eq('status', 'unmatched').select('id')
  if (error) return NextResponse.json({ error: /holding_deposit_id/.test(error.message) ? 'Needs migration 255 running in Supabase.' : error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'That bank line has already been matched or set aside' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
