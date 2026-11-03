/**
 * POST /api/admin/bank-import/preview
 * Parse a bank CSV and return a full preview before anything is committed.
 *
 * Nothing is written to the database here. The response tells the UI exactly
 * what WOULD happen on confirm, broken into four categories:
 *
 *   matched          — payment reference found, charge exists and is unpaid → will mark paid
 *   possible_dupe    — payment reference found, but that charge is already paid
 *                      → will be held as unallocated, admin must decide
 *   unmatched        — no payment reference found in description
 *   already_imported — dedup_hash already in bank_transactions → will be silently skipped
 *
 * Body: multipart/form-data with a 'file' field (CSV text file)
 */

import { demoPropertyIds, inScope } from '@/lib/demoProperties'
import { importedChargeIds } from '@/lib/finance/importedCharges'
import { createServiceClient } from '@/lib/supabase'
import { CROS_COLLECTS_RENT } from '@/lib/finance/mode'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'
import { ledgerStart } from '@/lib/clientLedger'
import { parseBankCSV, refCandidates, type ParsedTransaction } from '@/lib/parseBank'

export const dynamic = 'force-dynamic'

export interface PreviewTransaction extends ParsedTransaction {
  category: 'matched' | 'possible_dupe' | 'unmatched' | 'already_imported'
  rent_charge_id: string | null
  charge_month: string | null
  charge_status: string | null
  charge_amount_due: number | null
  charge_amount_received?: number
  tenancy_id: string | null
  tenant_person_id: string | null  // people.id for notification targeting
  expected_ref: string | null      // canonical reference for this tenancy
  property_id: string | null       // for bank_transactions.property_id
  tenant_name: string | null
  room_name: string | null
  property_name: string | null
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase
    .from('people').select('id, role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Parse multipart form
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  // practice mode (migrations 209 + 210): a practice file only matches demo houses' tenants; a real file never does
  const practice = form.get('practice') === '1'
  if (practice) { const { error: pe } = await supabase.from('bank_transactions').select('is_practice').limit(1); if (pe) return NextResponse.json({ error: 'Practice bank imports need migration 210 first' }, { status: 409 }) }
  const ok = inScope(await demoPropertyIds(supabase as any), practice)
  const csvText = await file.text()
  const parseResult = parseBankCSV(csvText)

  if (parseResult.transactions.length === 0) {
    return NextResponse.json({
      ok: true,
      transactions: [],
      summary: { matched: 0, possible_dupes: 0, unmatched: 0, already_imported: 0, credit_total: 0 },
      period_from: parseResult.period_from,
      period_to: parseResult.period_to,
      bank_name: parseResult.bank_name,
      warnings: parseResult.warnings,
    })
  }

  // ── Step 1: Check which hashes are already in the database ──────────────────
  const allHashes = parseResult.transactions.map(t => t.dedup_hash)
  const { data: existingTxns } = await supabase
    .from('bank_transactions')
    .select('dedup_hash')
    .in('dedup_hash', allHashes)
  const importedHashes = new Set((existingTxns || []).map((r: any) => r.dedup_hash))

  // A line that looks like one already imported — same day, amount and reference, but the bank worded it differently
  // this time (pending vs cleared) — is held for the office instead of going in twice (1 Nov 2026)
  const dates = [...new Set(parseResult.transactions.map(t => t.transaction_date))]
  const { data: sameDays } = dates.length ? await supabase.from('bank_transactions').select('id, transaction_date, amount, extracted_ref, description, dedup_hash').in('transaction_date', dates) : { data: [] as any[] }
  const nearDupeOf = (t: { transaction_date: string; amount: number; extracted_ref: string | null; description: string; dedup_hash: string }) =>
    ((sameDays ?? []) as any[]).find(x => x.transaction_date === t.transaction_date && Math.abs(Number(x.amount) - t.amount) < 0.005 && x.dedup_hash !== t.dedup_hash
      && (t.extracted_ref ? String(x.extracted_ref ?? '').toUpperCase() === t.extracted_ref.toUpperCase() : String(x.description).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) === t.description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)))

  // What this file covers against what's already been imported: gaps, and days imported part-way through
  const coverage: string[] = []
  {
    const { data: prev } = await supabase.from('bank_import_batches').select('period_from, period_to, imported_at, is_practice').not('period_to', 'is', null)
    const real = ((prev ?? []) as any[]).filter(b => !!b.is_practice === practice)
    const london = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    const covered = (d: string) => real.some(b => b.period_from <= d && d <= b.period_to && london(b.imported_at) > d)
    const lastEnd = real.map(b => b.period_to).sort().pop()
    const from = parseResult.period_from
    if (lastEnd && from && nextDay(lastEnd) < from) coverage.push(`Nothing has been imported for ${nextDay(lastEnd)}${nextDay(nextDay(lastEnd)) < from ? ` to ${new Date(Date.parse(`${from}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)}` : ''} — this file starts on ${from}. Download that period too so nothing is missed.`)
    for (const b of real) {
      const day = b.period_to
      if (london(b.imported_at) === day && !covered(day) && from && from > day)
        coverage.push(`${day} was imported part-way through the day (at ${new Date(b.imported_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}) and this file starts after it — anything that arrived later that day is missing. Include ${day} in your download.`)
    }
    if (parseResult.period_to && parseResult.period_to === london(new Date().toISOString()))
      coverage.push(`This file includes today (${parseResult.period_to}). Today will show as part-day on the calendar until a later import covers the rest of it.`)
  }

  // ── Step 2: Load all tenancies with payment_references and room/property info ─
  const { data: tenancies } = await supabase
    .from('tenancies')
    .select(`
      id,
      payment_reference,
      room_id,
      person_id,
      start_date, end_date, rent_amount, rent_due_day, deposit_amount, move_in_monies_received_at,
      rooms ( id, name, is_let_only, properties ( id, name, address, letting_type ) ),
      people!person_id ( salutation, first_name, last_name, full_name )
    `)
    .not('payment_reference', 'is', null)
    .or('end_date.is.null,end_date.gte.' + new Date(Date.now() - 90 * 86400000).toISOString().slice(0,10))

  // Build lookup: payment_reference → tenancy info
  interface TenancyInfo {
    tenancy_id: string
    person_id: string | null
    payment_reference: string
    room_id: string
    property_id: string | null
    room_name: string | null
    property_name: string | null
    tenant_name: string | null
    let_only: boolean
    move_in: { due: number; rent: number; start: string } | null
    start: string | null; end: string | null; names: string[]; dueDay: number
  }
  // a room's reference is shared by its tenants over time (changeovers), so a reference can mean several tenancies —
  // the payer's name decides, then whoever had the room on the payment date (3 Nov 2026: Demko paid with 075CRR05 and
  // was put on the outgoing tenant Joseph's account)
  const byRefAll = new Map<string, TenancyInfo[]>()
  const tenancyByRef = { set: (k: string, v: TenancyInfo) => byRefAll.set(k, [...(byRefAll.get(k) ?? []), v]), has: (k: string) => byRefAll.has(k), values: () => [...byRefAll.values()].flat() }
  for (const t of (tenancies || []) as any[]) {
    if (!t.payment_reference) continue
    if (!ok(t.rooms?.properties?.id)) continue
    tenancyByRef.set(t.payment_reference.toUpperCase(), {
      tenancy_id: t.id,
      person_id: t.person_id ?? null,
      payment_reference: t.payment_reference,
      room_id: t.room_id,
      property_id: t.rooms?.properties?.id ?? null,
      room_name: t.rooms?.name ?? null,
      let_only: !!t.rooms?.is_let_only || t.rooms?.properties?.letting_type === 'let_only',
      // move-in money not yet recorded: the first payment is rent AND deposit together, not rent alone
      move_in: !t.move_in_monies_received_at && t.start_date && Number(t.deposit_amount) > 0 ? { due: Number(t.rent_amount || 0) + Number(t.deposit_amount || 0), rent: Number(t.rent_amount || 0), start: t.start_date } : null,
      property_name: t.rooms?.properties?.name || t.rooms?.properties?.address || null,
      tenant_name: t.people
        ? [t.people.salutation, t.people.first_name, t.people.last_name].filter(Boolean).join(' ') || t.people.full_name || null
        : null,
      start: t.start_date ?? null, end: t.end_date ?? null, dueDay: Number(t.rent_due_day) || 1,
      names: [t.people?.last_name, t.people?.first_name].map((x: any) => String(x ?? '').toUpperCase().trim()).filter((x: string) => x.length >= 3),
    })
  }

  // ── Step 3: For each transaction, find the matching rent_charge ───────────────
  // We need to know which month the payment most likely covers.
  // Strategy: look for rent_charges for the tenancy's room_id around the transaction date.
  // We check the month of the transaction date and the previous month (in case payment arrives late).

  const roomIds = [...new Set([...tenancyByRef.values()].map(t => t.room_id))]
  let rentChargesByRoom = new Map<string, any[]>()

  // Only charges from when CROS took over rent, and never cleared ones — otherwise a payment could be put
  // against a month the previous agent collected
  const start = await ledgerStart(createServiceClient() as any)   // the office setting, read whatever the signed-in role can see
  if (roomIds.length > 0) {
    const { data: charges } = await supabase
      .from('rent_charges')
      .select('id, room_id, tenancy_id, charge_month, amount_due, amount_received, status, voided')
      .in('room_id', roomIds)
      .gte('charge_month', start)
      .order('charge_month', { ascending: false })
    for (const c of ((charges || []) as any[]).filter(c => !c.voided)) {
      if (!rentChargesByRoom.has(c.room_id)) rentChargesByRoom.set(c.room_id, [])
      rentChargesByRoom.get(c.room_id)!.push(c)
    }
  }

  // never a charge made from a previous agent's imported statement (lib/finance/importedCharges)
  const importedIds = await importedChargeIds(createServiceClient() as any, [...rentChargesByRoom.values()].flat().map(c => c.id))

  // The month a payment is for (3 Nov 2026, Harry's first import: 2 November rent went onto October, which his other
  // system had collected): the month it was paid in; if that month is already paid, the next (paid in advance).
  // Older unpaid months are never filled automatically — arrears are sorted out on the tenant's Money tab.
  function findBestCharge(tenancy: { room_id: string; tenancy_id?: string | null }, txnDate: string): any | null {
    const charges = (rentChargesByRoom.get(tenancy.room_id) || []).filter(c => c.tenancy_id === tenancy.tenancy_id && !importedIds.has(c.id))
    const month = txnDate.slice(0, 7)
    const next = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)).toISOString().slice(0, 7)
    const thisMonth = charges.find(c => String(c.charge_month).slice(0, 7) === month)
    if (thisMonth && thisMonth.status !== 'paid') return thisMonth
    const nextMonth = charges.find(c => String(c.charge_month).slice(0, 7) === next)
    if (thisMonth && nextMonth && nextMonth.status !== 'paid') return nextMonth
    return thisMonth ?? null   // paid already → flagged as a possible second payment; none yet → raised for this month
  }

  // ── Step 4: Categorise each transaction ──────────────────────────────────────
  const preview: PreviewTransaction[] = []

  for (const txn of parseResult.transactions) {
    const NULL_EXTRA = { tenant_person_id: null as null, expected_ref: null as null, property_id: null as null }

    if (importedHashes.has(txn.dedup_hash)) {
      preview.push({ ...txn, ...NULL_EXTRA, category: 'already_imported', rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: null, tenancy_id: null, tenant_name: null, room_name: null, property_name: null })
      continue
    }

    const near = nearDupeOf(txn)
    if (near) {
      preview.push({ ...txn, ...NULL_EXTRA, category: 'possible_dupe', near_duplicate_of: near.id, near_duplicate_text: near.description, rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: null, tenancy_id: null, tenant_name: null, room_name: null, property_name: null } as any)
      continue
    }

    // use whichever reference-like code in the line belongs to a real tenancy
    const ref = [txn.extracted_ref?.toUpperCase(), ...refCandidates(txn.description)].find(r => r && tenancyByRef.has(r)) ?? txn.extracted_ref?.toUpperCase() ?? null
    if (ref && ref !== txn.extracted_ref) txn.extracted_ref = ref
    const words = new Set(txn.description.toUpperCase().split(/[^A-Z]+/).filter(Boolean))
    const nameHit = (t: TenancyInfo) => t.names.some(n => words.has(n))
    const activeOn = (t: TenancyInfo, d: string) => (!t.start || t.start <= d) && (!t.end || t.end >= d)
    const pick = (list: TenancyInfo[]) => list.find(nameHit) ?? list.filter(t => activeOn(t, txn.transaction_date)).sort((a, b) => String(b.start).localeCompare(String(a.start)))[0] ?? list[0]
    let tenancy = ref && byRefAll.has(ref) ? pick(byRefAll.get(ref)!) : null
    // no known reference: the payer's surname against whoever lives there now — only when exactly one tenant fits,
    // and checked against the house number in any reference they used (St George's Mews pays as 001SGM0x, set up as 001STG0x)
    if (!tenancy) {
      const houseNos = refCandidates(txn.description).map(r => r.slice(0, 3))
      const fits = tenancyByRef.values().filter(t => activeOn(t, txn.transaction_date) && nameHit(t) && (!houseNos.length || houseNos.includes(t.payment_reference.toUpperCase().slice(0, 3))))
      const unique = [...new Map(fits.map(t => [t.tenancy_id, t])).values()]
      if (unique.length === 1) { tenancy = unique[0]; (txn as any).matched_by_name = true }
    }

    if (!tenancy) {
      preview.push({ ...txn, ...NULL_EXTRA, category: 'unmatched', rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: null, tenancy_id: null, tenant_name: null, room_name: null, property_name: null })
      continue
    }

    // let-only (Harry, 3 Nov 2026): the only money we take is the move-in money — holding deposit, first rent and
    // deposit — recorded on the letting file as initial monies. It is never monthly rent, so no charge is raised for it.
    if (tenancy.let_only) {
      preview.push({ ...txn, tenant_person_id: tenancy.person_id, expected_ref: tenancy.payment_reference, property_id: tenancy.property_id, category: 'unmatched', let_only: true, rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: null, tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name } as any)
      continue
    }

    // paid before CROS took over the rent (your records start): that month was collected elsewhere — it's never
    // moved onto a CROS month (3 Nov 2026: a 15 October payment would have paid November)
    // …unless it's the first CROS month's rent paid a few days early (Harry: "some of the rents for november could be
    // paid in late october"): the tenant's next due date is in a CROS month and at most 10 days away
    if (txn.transaction_date < start) {
      const d = txn.transaction_date, [y, m, dd] = d.split('-').map(Number)
      const dueThis = new Date(Date.UTC(y, m - 1, Math.min(tenancy.dueDay, new Date(Date.UTC(y, m, 0)).getUTCDate()))).toISOString().slice(0, 10)
      const nextDue = dueThis >= d ? dueThis : new Date(Date.UTC(y, m, Math.min(tenancy.dueDay, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()))).toISOString().slice(0, 10)
      if (nextDue >= start && Date.parse(nextDue) - Date.parse(d) <= 10 * 86_400_000) {
        (txn as any).paid_early_for = nextDue.slice(0, 7) + '-01'
      }
    }
    if (txn.transaction_date < start && !(txn as any).paid_early_for) {
      preview.push({ ...txn, tenant_person_id: tenancy.person_id, expected_ref: tenancy.payment_reference, property_id: tenancy.property_id, category: 'unmatched', before_start: start, rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: null, tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name } as any)
      continue
    }

    // a managed tenant's move-in payment (first rent + deposit) around the start date: it's split on the letting file —
    // the rent onto the first month, the deposit held for the DPS — so it isn't put against rent here (3 Nov 2026)
    const mi = tenancy.move_in
    if (mi && Number(txn.amount) > mi.rent + 0.005 && Math.abs(Date.parse(txn.transaction_date) - Date.parse(mi.start)) < 45 * 86_400_000) {
      preview.push({ ...txn, tenant_person_id: tenancy.person_id, expected_ref: tenancy.payment_reference, property_id: tenancy.property_id, category: 'unmatched', move_in: true, rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: mi.due, tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name } as any)
      continue
    }

    const payDate = (txn as any).paid_early_for ?? txn.transaction_date   // the bank date is kept; only the month it pays changes
    const charge = findBestCharge(tenancy, payDate)
    const TENANCY_EXTRA = { tenant_person_id: tenancy.person_id, expected_ref: tenancy.payment_reference, property_id: tenancy.property_id }

    if (!charge) {
      // Tenancy found but that month's rent hasn't been raised yet: still a match — the charge is raised for this
      // tenancy when the import is confirmed, and the payment recorded against it.
      const txnMonth = `${payDate.slice(0, 7)}-01`
      const raiseMonth = txnMonth < start ? start : txnMonth   // paid before CROS took over → that's the first CROS month
      preview.push({ ...txn, ...TENANCY_EXTRA, category: 'matched', raise_charge_month: raiseMonth, rent_charge_id: null, charge_month: raiseMonth, charge_status: 'to be raised', charge_amount_due: null, tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name } as any)
      continue
    }

    if (charge.status === 'paid') {
      // Charge already paid — possible genuine double payment, flag for human review
      preview.push({ ...txn, ...TENANCY_EXTRA, category: 'possible_dupe', rent_charge_id: charge.id, charge_month: charge.charge_month, charge_status: charge.status, charge_amount_due: charge.amount_due, charge_amount_received: Number(charge.amount_received || 0), tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name })
      continue
    }

    // Identical lines in one file (same day, amount and wording): two real payments, or the same one downloaded twice?
    // Accepted when they add up to what's owed this month, or the running balance shows every line is real;
    // otherwise held for the office to check in the bank (Harry, 1 Nov 2026).
    const twins = parseResult.transactions.filter(t => t.repeat_group === txn.repeat_group)
    if (twins.length > 1) {
      const outstanding = Number(charge.amount_due || 0) - Number(charge.amount_received || 0)
      const sum = twins.reduce((n, t) => n + t.amount, 0)
      const balanceProves = parseResult.balance_breaks !== undefined && parseResult.opening_balance != null && !(parseResult.balance_breaks ?? []).length
      if (!(Math.abs(sum - outstanding) < 0.01 || balanceProves)) {
        preview.push({ ...txn, ...TENANCY_EXTRA, category: 'possible_dupe', double_import: true, rent_charge_id: charge.id, charge_month: charge.charge_month, charge_status: charge.status, charge_amount_due: charge.amount_due, charge_amount_received: Number(charge.amount_received || 0), tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name } as any)
        continue
      }
      ;(txn as any).twin_ok = Math.abs(sum - outstanding) < 0.01 ? `${twins.length} payments of £${txn.amount.toFixed(2)} add up to this month’s rent` : 'the running balance confirms each payment'
    }

    // Clean match — unpaid charge, reference found
    preview.push({ ...txn, ...TENANCY_EXTRA, category: 'matched', rent_charge_id: charge.id, charge_month: charge.charge_month, charge_status: charge.status, charge_amount_due: charge.amount_due, charge_amount_received: Number(charge.amount_received || 0), tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name })
  }

  const summary = {
    matched:          preview.filter(t => t.category === 'matched').length,
    possible_dupes:   preview.filter(t => t.category === 'possible_dupe').length,
    unmatched:        preview.filter(t => t.category === 'unmatched').length,
    already_imported: preview.filter(t => t.category === 'already_imported').length,
    credit_total:     parseResult.credit_total,
  }

  return NextResponse.json({
    ok: true, trial: !CROS_COLLECTS_RENT && !practice,
    transactions: preview,
    summary,
    period_from: parseResult.period_from,
    period_to: parseResult.period_to,
    bank_name: parseResult.bank_name,
    filename: file.name,
    warnings: [...coverage, ...parseResult.warnings],
    day_counts: parseResult.day_counts ?? null,
    opening_balance: parseResult.opening_balance ?? null,
    closing_balance: parseResult.closing_balance ?? null,
    balance_breaks: parseResult.balance_breaks ?? [],
  })
}
