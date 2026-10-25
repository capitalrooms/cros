/**
 * GET /api/admin/bank-import/unmatched
 * Returns all unmatched bank_transactions for the reconciliation queue.
 */

import { demoPropertyIds, inScope } from '@/lib/demoProperties'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { ledgerStart } from '@/lib/clientLedger'
import { expectedFor } from '@/lib/finance/initialMonies'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase
    .from('people').select('role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: transactions } = await supabase
    .from('bank_transactions')
    .select('*, bank_import_batches(filename, bank_name)')
    .eq('status', 'unmatched')
    .order('transaction_date', { ascending: false })
    .limit(200)
  // lines set aside as not rent (they can be put back)
  const { data: setAside } = await supabase
    .from('bank_transactions')
    .select('id, transaction_date, amount, description, is_practice, property_id, matched_at')
    .eq('status', 'ignored')
    .order('transaction_date', { ascending: false })
    .limit(100)

  // Tenancies to match against: everyone current, moving in within 60 days, or moved out in the last 120 days
  // (arrears and final payments still arrive) — with or without a payment reference
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  const { data: tenancies } = await supabase
    .from('tenancies')
    .select(`
      id, room_id, person_id, rent_amount, payment_reference, start_date, end_date, let_cancelled_at, bank_sender_name,
      people:people!person_id(id, salutation, first_name, last_name),
      rooms(id, name, properties(id, name))
    `)
    .lte('start_date', shift(60))
    .or(`end_date.is.null,end_date.gte.${shift(-120)}`)
    .is('let_cancelled_at', null)

  // Oldest unpaid charge per room (from when CROS took over rent; cleared charges don't count). A tenant who is
  // all paid up gets their latest charge instead — money put there rolls on to the next month (lib/payments/apply).
  const roomIds = (tenancies || []).map((t: any) => t.room_id).filter(Boolean)
  // each tenancy's oldest unpaid charge (else its latest): its own charges — one with no tenancy is the room's (pre-217)
  let live: any[] = []
  if (roomIds.length) {
    const { data: charges } = await supabase
      .from('rent_charges')
      .select('id, room_id, tenancy_id, charge_month, amount_due, amount_received, status, voided')
      .in('room_id', roomIds)
      .gte('charge_month', await ledgerStart(supabase as any))
      .order('charge_month', { ascending: true })
    live = (charges || []).filter((c: any) => !c.voided)
  }
  const unpaid = (c: any) => ['pending', 'partial', 'overdue'].includes(c.status)
  const chargeFor = (t: any) => {
    let best: any = null
    for (const c of live.filter(c => c.room_id === t.room_id && (c.tenancy_id ? c.tenancy_id === t.id : true)))
      if (!best || (!unpaid(best) && (unpaid(c) || c.charge_month > best.charge_month))) best = c
    return best
  }

  const tenancyOptions = (tenancies || []).map((t: any) => {
    const charge = chargeFor(t)
    return {
      tenancy_id: t.id,
      person_id: t.person_id,
      name: [t.people?.salutation, t.people?.first_name, t.people?.last_name].filter(Boolean).join(' '),
      payment_reference: t.payment_reference,
      room_name: t.rooms?.name ?? null,
      property_name: t.rooms?.properties?.name ?? null,
      property_id: t.rooms?.properties?.id ?? null,
      rent_amount: t.rent_amount,
      sender_name: t.bank_sender_name ?? null,
      when: t.start_date > today ? `moving in ${t.start_date}` : t.end_date && t.end_date < today ? `left ${t.end_date}` : null,
      charge: charge ? { id: charge.id, month: charge.charge_month, amount_due: charge.amount_due, amount_received: charge.amount_received, status: charge.status } : null,
    }
  }).filter((t: any) => t.name)

  // practice (?practice=1): practice lines and demo houses' tenants only; the real list never shows either
  const practice = req.nextUrl.searchParams.get('practice') === '1'
  const ok = inScope(await demoPropertyIds(supabase as any), practice)
  const shownTxns = ((transactions || []) as any[]).filter(t => !!t.is_practice === practice && (t.property_id ? ok(t.property_id) : true))

  // let-only lets waiting for their initial monies (migration 231): a line that looks like a tenant's balance is
  // flagged, so it's recorded on the letting file — never matched to rent here by mistake (21 Oct 2026 audit)
  const initialHints: Record<string, { tenancy_id: string; name: string; house: string; balance_due: number; why: string }> = {}
  const { data: waiting } = await supabase.from('tenancies')
    .select('id, property_id, start_date, properties!inner(letting_type, name)')
    .eq('properties.letting_type', 'let_only').is('let_cancelled_at', null).is('move_in_monies_received_at', null)
    .gte('start_date', shift(-42)).lte('start_date', shift(90))
  const { data: done } = await supabase.from('initial_monies').select('tenancy_id').is('voided_at', null)
  const recorded = new Set(((done ?? []) as any[]).map(d => d.tenancy_id))
  for (const t of ((waiting ?? []) as any[]).filter(t => ok(t.property_id) && !recorded.has(t.id))) {
    const e = await expectedFor(supabase as any, t.id)
    if ('error' in e || !e.balanceDue) continue
    const surname = e.tenantName.split(' ').pop()?.toLowerCase() ?? ''
    for (const b of shownTxns) {
      if (initialHints[b.id] || Number(b.amount) <= 0) continue
      const exact = Math.abs(Number(b.amount) - e.balanceDue) < 0.005, near = !exact && Math.abs(Number(b.amount) - e.balanceDue) <= 1
      const named = surname.length > 2 && String(`${b.description ?? ''} ${b.extracted_ref ?? ''}`).toLowerCase().includes(surname)
      if (exact || (near && named) || (named && Number(b.amount) >= e.balanceDue * 0.5)) {
        initialHints[b.id] = { tenancy_id: t.id, name: e.tenantName, house: String(t.properties?.name ?? '').split('\n')[0], balance_due: e.balanceDue,
          why: [exact ? 'exactly the balance due' : near ? 'within £1 of the balance due' : '', named ? 'their name is on the payment' : ''].filter(Boolean).join(' · ') }
      }
    }
  }

  return NextResponse.json({
    transactions: shownTxns,
    initial_monies_hints: initialHints,
    tenancy_options: tenancyOptions.filter((t: any) => ok(t.property_id)),
    set_aside: ((setAside || []) as any[]).filter(t => !!t.is_practice === practice && (t.property_id ? ok(t.property_id) : true)),
  })
}
