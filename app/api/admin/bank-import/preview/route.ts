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

  // ── Step 2: Load all tenancies with payment_references and room/property info ─
  const { data: tenancies } = await supabase
    .from('tenancies')
    .select(`
      id,
      payment_reference,
      room_id,
      person_id,
      rooms ( id, name, properties ( id, name, address ) ),
      people!person_id ( first_name, last_name, full_name )
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
  }
  const tenancyByRef = new Map<string, TenancyInfo>()
  for (const t of (tenancies || []) as any[]) {
    if (!t.payment_reference) continue
    tenancyByRef.set(t.payment_reference.toUpperCase(), {
      tenancy_id: t.id,
      person_id: t.person_id ?? null,
      payment_reference: t.payment_reference,
      room_id: t.room_id,
      property_id: t.rooms?.properties?.id ?? null,
      room_name: t.rooms?.name ?? null,
      property_name: t.rooms?.properties?.name || t.rooms?.properties?.address || null,
      tenant_name: t.people
        ? [t.people.first_name, t.people.last_name].filter(Boolean).join(' ') || t.people.full_name || null
        : null,
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
  const start = await ledgerStart(supabase as any)
  if (roomIds.length > 0) {
    const { data: charges } = await supabase
      .from('rent_charges')
      .select('id, room_id, charge_month, amount_due, amount_received, status, voided')
      .in('room_id', roomIds)
      .gte('charge_month', start)
      .order('charge_month', { ascending: false })
    for (const c of ((charges || []) as any[]).filter(c => !c.voided)) {
      if (!rentChargesByRoom.has(c.room_id)) rentChargesByRoom.set(c.room_id, [])
      rentChargesByRoom.get(c.room_id)!.push(c)
    }
  }

  function findBestCharge(roomId: string, txnDate: string): any | null {
    const charges = rentChargesByRoom.get(roomId) || []
    if (!charges.length) return null

    // Industry standard: always allocate to the OLDEST unpaid charge first.
    // This is legally correct — clears historic arrears before current month.
    // Only fall through to paid charges if there are no unpaid ones at all.
    const unpaid = charges
      .filter(c => ['pending', 'partial', 'overdue'].includes(c.status))
      .sort((a, b) => a.charge_month < b.charge_month ? -1 : 1) // oldest first

    if (unpaid.length > 0) return unpaid[0]

    // All charges paid — look for the one matching the transaction month to flag as possible_dupe
    const txnMonth = txnDate.slice(0, 7)
    return charges.find(c => (c.charge_month as string).slice(0, 7) === txnMonth)
      || charges[0]
      || null
  }

  // ── Step 4: Categorise each transaction ──────────────────────────────────────
  const preview: PreviewTransaction[] = []

  for (const txn of parseResult.transactions) {
    const NULL_EXTRA = { tenant_person_id: null as null, expected_ref: null as null, property_id: null as null }

    if (importedHashes.has(txn.dedup_hash)) {
      preview.push({ ...txn, ...NULL_EXTRA, category: 'already_imported', rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: null, tenancy_id: null, tenant_name: null, room_name: null, property_name: null })
      continue
    }

    // use whichever reference-like code in the line belongs to a real tenancy
    const ref = [txn.extracted_ref?.toUpperCase(), ...refCandidates(txn.description)].find(r => r && tenancyByRef.has(r)) ?? txn.extracted_ref?.toUpperCase() ?? null
    if (ref && ref !== txn.extracted_ref) txn.extracted_ref = ref
    const tenancy = ref ? tenancyByRef.get(ref) : null

    if (!tenancy) {
      preview.push({ ...txn, ...NULL_EXTRA, category: 'unmatched', rent_charge_id: null, charge_month: null, charge_status: null, charge_amount_due: null, tenancy_id: null, tenant_name: null, room_name: null, property_name: null })
      continue
    }

    const charge = findBestCharge(tenancy.room_id, txn.transaction_date)
    const TENANCY_EXTRA = { tenant_person_id: tenancy.person_id, expected_ref: tenancy.payment_reference, property_id: tenancy.property_id }

    if (!charge) {
      // Tenancy found but that month's rent hasn't been raised yet: still a match — the charge is raised for this
      // tenancy when the import is confirmed, and the payment recorded against it.
      const txnMonth = `${txn.transaction_date.slice(0, 7)}-01`
      const raiseMonth = txnMonth < start ? start : txnMonth   // paid before CROS took over → that's the first CROS month
      preview.push({ ...txn, ...TENANCY_EXTRA, category: 'matched', raise_charge_month: raiseMonth, rent_charge_id: null, charge_month: raiseMonth, charge_status: 'to be raised', charge_amount_due: null, tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name } as any)
      continue
    }

    if (charge.status === 'paid') {
      // Charge already paid — possible genuine double payment, flag for human review
      preview.push({ ...txn, ...TENANCY_EXTRA, category: 'possible_dupe', rent_charge_id: charge.id, charge_month: charge.charge_month, charge_status: charge.status, charge_amount_due: charge.amount_due, charge_amount_received: Number(charge.amount_received || 0), tenancy_id: tenancy.tenancy_id, tenant_name: tenancy.tenant_name, room_name: tenancy.room_name, property_name: tenancy.property_name })
      continue
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
    ok: true,
    transactions: preview,
    summary,
    period_from: parseResult.period_from,
    period_to: parseResult.period_to,
    bank_name: parseResult.bank_name,
    filename: file.name,
    warnings: parseResult.warnings,
  })
}
