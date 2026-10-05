// Finance health check — the data gaps that stop the money side working, each with its fix.
// GET                                   the checks
// POST { action: 'fill_refs' }          give every current tenancy without one its payment reference
//                                       (house number + street letters + room, e.g. 208ROS05)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { demoPropertyIds } from '@/lib/demoProperties'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'
import { loadLedger, landlordBalances, ledgerStart } from '@/lib/clientLedger'
import { syncRoomStatuses } from '@/lib/rooms/syncStatus'
import { feeFixesFromStatements } from '@/lib/fees/fromStatements'
import { resolveFee } from '@/lib/fees/managementFee'
import { fileIntoProperty, parseStorageUrl } from '@/lib/files/storage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

interface Check { key: string; title: string; ok: boolean; count: number; detail: string; items: { label: string; href?: string }[]; fix?: { action: string; label: string } | { href: string; label: string } }

async function activeTenancies(s: ReturnType<typeof svc>, demo: Set<string>) {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await s.from('tenancies').select('id, property_id, room_id, payment_reference, deposit_amount, deposit_scheme_ref, start_date, rooms(name), properties(name), people!person_id(id, first_name, last_name, full_name)')
    .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  return ((data ?? []) as any[]).filter(t => !demo.has(t.property_id))
}
const who = (t: any) => [t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ') || t.people?.full_name || 'Tenant'
const where = (t: any) => `${t.rooms?.name ?? ''}, ${String(t.properties?.name || '').split('\n')[0]}`


// Tenancies whose end date has no notice behind it and might really be carrying on. Leaves out anyone whose room
// someone else has moved into since (they've gone — e.g. Marija, 4 Willis Rd Room 2, replaced by a new tenant), lets
// that fell through, demo and let-only houses, and rooms already marked on notice or empty. Shared by the check and
// "make rolling", so the button can never bring back a tenancy that has ended.
async function endDatesToSort(s: any) {
  const { data } = await s.from('tenancies')
    .select('id, room_id, person_id, start_date, end_date, let_cancelled_at, rooms(name, status), properties(name, is_demo, letting_type), people!person_id(first_name, last_name)')
    .not('end_date', 'is', null).is('notice_received_date', null).is('let_cancelled_at', null).order('end_date')
  const rows = ((data ?? []) as any[]).filter(t => !t.properties?.is_demo && t.properties?.letting_type !== 'let_only' && t.rooms?.status !== 'on_notice' && t.rooms?.status !== 'available')
  if (!rows.length) return []
  const { data: inRooms } = await s.from('tenancies').select('id, room_id, start_date, let_cancelled_at').in('room_id', [...new Set(rows.map(t => t.room_id).filter(Boolean))])
  const replaced = (t: any) => ((inRooms ?? []) as any[]).some(o => o.id !== t.id && !o.let_cancelled_at && o.room_id === t.room_id && o.start_date && o.start_date > t.start_date)
  return rows.filter(t => !replaced(t))
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const demo = await demoPropertyIds(s)
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7) + '-01'
  const [tens, rooms, props, banks, charges, recs, ledger] = await Promise.all([
    activeTenancies(s, demo),
    s.from('rooms').select('id, name, status, property_id, properties(name)'),
    s.from('properties').select('id, name, landlord_id'),
    s.from('landlord_bank_accounts').select('landlord_id'),
    s.from('rent_charges').select('room_id').eq('charge_month', month),
    s.from('client_reconciliations').select('as_at').order('as_at', { ascending: false }).limit(1),
    loadLedger(s),
  ])
  const { data: inboxFiled } = await s.from('property_documents').select('id, file_name, document_type').ilike('storage_url', '%/inbox-docs/%')
  const start = await ledgerStart(s)
  const preLedger = await preLedgerCharges(s, start, demo)
  const startLabel = new Date(start + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const roomChanges = await syncRoomStatuses(s, { apply: false }).catch(() => [])
  const feeFixes = await feeFixesFromStatements(s).catch(() => [])
  // current managed tenancies with no management fee at all (neither their own nor the property's)
  const { data: feeTens } = await s.from('tenancies').select('id, person_id, management_fee_type, management_fee_pct, management_fee_fixed, rooms(name), properties(name, is_demo, letting_type, management_fee_type, management_fee_pct, management_fee_fixed), people!person_id(first_name, last_name)')
    .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
  const noFee = ((feeTens ?? []) as any[]).filter(t => !t.properties?.is_demo && t.properties?.letting_type !== 'let_only' && resolveFee(t, t.properties).source === 'none')
  // End dates with no notice: usually a fixed-term end entered with the tenancy. Since the Renters' Rights Act the
  // tenancy simply continues, but CROS would treat it as finished (no rent raised, shown as past) — so ask.
  const fixedEnds = await endDatesToSort(s)
  const realProps = (props.data ?? []).filter((p: any) => !demo.has(p.id))
  const letRooms = new Set(tens.map(t => t.room_id))
  const charged = new Set((charges.data ?? []).map((c: any) => c.room_id))
  const withBank = new Set((banks.data ?? []).map((b: any) => b.landlord_id))
  const { data: landlords } = await s.from('people').select('id, first_name, last_name, full_name, company').in('id', [...new Set(realProps.map((p: any) => p.landlord_id).filter(Boolean))])
  const lname = (id: string) => { const p: any = (landlords ?? []).find((x: any) => x.id === id); return p ? (p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name) : 'Landlord' }
  const negative = (await landlordBalances(s, ledger.entries)).filter(b => b.balance < -0.005)

  // missing, or clearly broken (no house number, e.g. "000401" from an address starting "Flat 4") — an ordinary
  // reference that simply differs from the formula is left alone, as the tenant may already pay with it
  const noRef = tens.filter(t => refNeedsFixing(t.payment_reference))
  const ghost = ((rooms.data ?? []) as any[]).filter(r => !demo.has(r.property_id) && r.status === 'occupied' && !letRooms.has(r.id))
  const noLandlord = realProps.filter((p: any) => !p.landlord_id)
  const noBank = [...new Set(realProps.map((p: any) => p.landlord_id).filter(Boolean))].filter(id => !withBank.has(id))
  const unbilled = tens.filter(t => !charged.has(t.room_id))
  const noDeposit = tens.filter(t => Number(t.deposit_amount || 0) > 0 && !t.deposit_scheme_ref)
  const lastRec = recs.data?.[0]?.as_at ?? null
  const recDue = !lastRec || (Date.parse(today) - Date.parse(lastRec)) / 86_400_000 > 35

  const checks: Check[] = [
    { key: 'refs', title: 'Payment references', ok: !noRef.length, count: noRef.length, detail: 'Each tenancy needs one fixed reference for its rent — it’s how bank payments are matched.',
      items: noRef.slice(0, 50).map(t => ({ label: `${who(t)} · ${where(t)}${t.payment_reference ? ` (now ${t.payment_reference})` : ''} → ${buildPaymentRef(t.properties?.name || '', t.rooms?.name)}` })), fix: { action: 'fill_refs', label: `Fill in or fix ${noRef.length} reference${noRef.length === 1 ? '' : 's'}` } },
    month < start
      ? { key: 'charges', title: 'Rent charges', ok: true, count: 0, detail: `CROS starts collecting rent on ${startLabel}. Charges are raised automatically that morning, and on the 1st of every month after.`, items: [] }
      : { key: 'charges', title: `Rent charges for ${new Date(month + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, ok: !unbilled.length, count: unbilled.length, detail: 'They’re raised automatically on the 1st. Tenancies below have no charge for this month yet.',
        items: unbilled.slice(0, 50).map(t => ({ label: `${who(t)} · ${where(t)}` })), fix: { href: '/admin/rent-charges', label: 'Raise charges' } },
    { key: 'pre_ledger', title: `Unpaid rent from before ${startLabel}`, ok: !preLedger.length, count: preLedger.length,
      detail: `Rent before ${startLabel} was collected by your previous agent, so CROS can’t see whether it was paid. These charges would show as arrears and chase the tenant. Clearing them marks them as not collected by CROS — they stay on record.`,
      items: preLedger.map(c => ({ label: `${c.rooms?.name ?? 'Room'}, ${String(c.properties?.name || '').split('\n')[0]} · ${new Date(c.charge_month + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · £${Number(c.amount_due).toFixed(2)}${Number(c.amount_received) > 0 ? ` (£${Number(c.amount_received).toFixed(2)} received)` : ''}` })),
      fix: { action: 'void_pre_ledger', label: `Clear ${preLedger.length} charge${preLedger.length === 1 ? '' : 's'}` } },
    { key: 'inbox_files', title: 'Filed documents still stored in the email inbox', ok: !(inboxFiled ?? []).length, count: (inboxFiled ?? []).length,
      detail: 'These certificates and documents were filed from emails but still point at the inbox folder, which is being made private. Moving them copies each into its property’s documents — nothing is lost.',
      items: ((inboxFiled ?? []) as any[]).slice(0, 50).map(d => ({ label: `${d.file_name || 'Document'} · ${String(d.document_type || '').replace(/_/g, ' ')}` })),
      fix: { action: 'move_inbox_files', label: `Move ${(inboxFiled ?? []).length} document${(inboxFiled ?? []).length === 1 ? '' : 's'}` } },
    { key: 'fees_statements', title: 'Management fees to match your statements', ok: !feeFixes.length, count: feeFixes.length,
      detail: 'The fee each room was actually charged on its latest landlord statement. Each property gets the rate most rooms pay as its standard fee; any tenancy on a different rate (or a fixed £ fee) gets its own.',
      items: feeFixes.map(f => ({ label: `${f.label}: ${f.from} → ${f.to}` })), fix: { action: 'apply_statement_fees', label: `Set ${feeFixes.length} fee${feeFixes.length === 1 ? '' : 's'} from the statements` } },
    { key: 'fees_missing', title: 'Tenancies with no management fee', ok: !noFee.length, count: noFee.length,
      detail: 'Neither the tenancy nor its property has a management fee, so statements can’t work out the fee. Set it on the property (or the tenancy if it’s different).',
      items: noFee.map(t => ({ label: `${[t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ')} · ${t.rooms?.name}, ${String(t.properties?.name || '').split('\n')[0]}`, href: t.person_id ? `/admin/tenant/${t.person_id}?tab=tenancy` : undefined })) },
    { key: 'fixed_ends', title: 'End dates with no notice given', ok: !fixedEnds.length, count: fixedEnds.length,
      detail: 'These tenancies have an end date but no notice was recorded — usually the end of a fixed term. The tenancy carries on (it’s periodic), but CROS would stop raising rent and treat it as ended on that date. If they’re staying, make them rolling; if someone is actually leaving, open their tenancy and record the notice instead.',
      items: fixedEnds.map(t => ({ label: `${[t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ')} · ${t.rooms?.name}, ${String(t.properties?.name || '').split('\n')[0]} · ends ${new Date(t.end_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${t.end_date < today ? ' (passed)' : ''}`, href: t.person_id ? `/admin/tenant/${t.person_id}?tab=tenancy` : undefined })),
      fix: { action: 'make_rolling', label: `They’re staying — make ${fixedEnds.length} rolling` } },
    { key: 'room_status', title: 'Room statuses out of date', ok: !roomChanges.length, count: roomChanges.length, detail: 'Rooms whose status doesn’t match their tenancies — e.g. still “on notice” after the tenant has left. This is also done automatically every night.',
      items: roomChanges.map(c => ({ label: `${c.room}, ${c.property}: ${c.from.replace('_', ' ')} → ${c.to.replace('_', ' ')}` })), fix: { action: 'sync_rooms', label: `Update ${roomChanges.length} room${roomChanges.length === 1 ? '' : 's'}` } },
    { key: 'ghost', title: 'Rooms marked let with no tenancy', ok: !ghost.length, count: ghost.length, detail: 'These rooms are marked occupied but have no current tenancy, so they’re missing from the rent roll and statements.',
      items: ghost.map(r => ({ label: `${r.name}, ${String(r.properties?.name || '').split('\n')[0]}`, href: `/admin/properties/${r.property_id}/rooms/${r.id}` })) },
    { key: 'landlord', title: 'Properties without a landlord', ok: !noLandlord.length, count: noLandlord.length, detail: 'Rent can’t be put on a statement or a client ledger without a landlord.',
      items: noLandlord.map((p: any) => ({ label: String(p.name || '').split('\n')[0], href: `/admin/properties/${p.id}` })) },
    { key: 'bank', title: 'Landlords without bank details', ok: !noBank.length, count: noBank.length, detail: 'Needed for the payout run on the 5th.',
      items: noBank.map(id => ({ label: lname(id), href: `/admin/landlord/${id}` })) },
    { key: 'deposits', title: 'Deposits without a protection reference', ok: !noDeposit.length, count: noDeposit.length, detail: 'Deposits must be protected within 30 days of the tenancy starting.',
      items: noDeposit.slice(0, 50).map(t => ({ label: `${who(t)} · ${where(t)}` })), fix: { href: '/admin/deposits', label: 'Open deposits' } },
    { key: 'negative', title: 'Client ledgers below zero', ok: !negative.length, count: negative.length, detail: 'A landlord’s balance must never go below zero.',
      items: negative.map(b => ({ label: `${b.name}: £${b.balance.toFixed(2)}` })), fix: { href: '/admin/client-money', label: 'Open client money' } },
    { key: 'recon', title: 'Monthly reconciliation', ok: !recDue, count: recDue ? 1 : 0, detail: lastRec ? `Last signed off ${new Date(lastRec + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Never done — sign one off each month.',
      items: [], fix: { href: '/admin/client-money', label: 'Reconcile' } },
  ]
  return NextResponse.json({ checks })
}

// Unpaid charges for months before the ledger start — the previous agent collected those, so they aren't arrears.
async function preLedgerCharges(s: ReturnType<typeof svc>, start: string, demo: Set<string>) {
  const { data } = await s.from('rent_charges').select('id, charge_month, amount_due, amount_received, status, rooms(name), properties(name), property_id')
    .lt('charge_month', start).in('status', ['pending', 'overdue', 'partial']).or('voided.is.null,voided.eq.false').order('charge_month')
  return ((data ?? []) as any[]).filter(c => !demo.has(c.property_id))
}

const refNeedsFixing = (ref: string | null | undefined) => !ref || /^000/.test(ref) || !/[A-Z]/i.test(ref)

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = svc()
  if (b.action === 'move_inbox_files') {
    const { data: docs } = await s.from('property_documents').select('id, property_id, file_name, storage_url').ilike('storage_url', '%/inbox-docs/%')
    let moved = 0
    const failed: string[] = []
    for (const d of (docs ?? []) as any[]) {
      const ref = parseStorageUrl(d.storage_url)
      if (!ref) continue
      try {
        const url = await fileIntoProperty(s, ref.path, d.property_id, d.file_name)
        const { error } = await s.from('property_documents').update({ storage_url: url }).eq('id', d.id)
        if (error) throw new Error(error.message)
        moved++
      } catch (e) { failed.push(`${d.file_name}: ${e instanceof Error ? e.message : 'failed'}`) }
    }
    return NextResponse.json({ ok: !failed.length, filled: moved, message: `Moved ${moved} document${moved === 1 ? '' : 's'} into their properties.${failed.length ? ' Not moved: ' + failed.join('; ') : ''}` })
  }
  if (b.action === 'void_pre_ledger') {
    const start = await ledgerStart(s)
    const list = await preLedgerCharges(s, start, await demoPropertyIds(s))
    const now = new Date().toISOString()
    const note = `Before ${start}: rent collected by the previous agent, not by CROS`
    let done = 0
    for (const c of list) {
      const { error } = await s.from('rent_charges')
        .update({ status: 'waived', voided: true, voided_at: now, voided_by: admin.personId, voided_note: note })
        .eq('id', c.id).in('status', ['pending', 'overdue', 'partial'])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await s.from('payment_audit_log').insert({
        rent_charge_id: c.id, action: 'voided', performed_by: admin.personId, performed_at: now,
        old_value: { status: c.status, amount_due: c.amount_due, amount_received: c.amount_received }, new_value: { status: 'waived', voided: true }, note,
      })
      done++
    }
    return NextResponse.json({ ok: true, filled: done, message: `Cleared ${done} charge${done === 1 ? '' : 's'} from before CROS took over rent. They’re kept on record, marked as collected by the previous agent.` })
  }
  if (b.action === 'apply_statement_fees') {
    const fixes = await feeFixesFromStatements(s)
    for (const f of fixes) {
      const { error } = await s.from(f.kind === 'property' ? 'properties' : 'tenancies').update(f.set).eq('id', f.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, filled: fixes.length, message: `Set ${fixes.length} management fee${fixes.length === 1 ? '' : 's'} from the statements.` })
  }
  if (b.action === 'make_rolling') {
    // clear the fixed-term end date on tenancies with no notice (same filter as the check above)
    const today = new Date().toISOString().slice(0, 10)
    const ids = (await endDatesToSort(s)).map((t: any) => t.id)
    if (ids.length) {
      const { error } = await s.from('tenancies').update({ end_date: null, is_periodic: true }).in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, filled: ids.length, message: `${ids.length} tenanc${ids.length === 1 ? 'y is' : 'ies are'} now rolling — no end date until notice is given.${today ? '' : ''}` })
  }
  if (b.action === 'sync_rooms') {
    const changes = await syncRoomStatuses(s, { apply: true })
    return NextResponse.json({ ok: true, filled: changes.length, message: `Updated ${changes.length} room${changes.length === 1 ? '' : 's'}.` })
  }
  if (b.action !== 'fill_refs') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const tens = (await activeTenancies(s, await demoPropertyIds(s))).filter(t => refNeedsFixing(t.payment_reference))
  let filled = 0
  for (const t of tens) {
    const ref = buildPaymentRef(t.properties?.name || '', t.rooms?.name)
    if (!/^\d{3,4}[A-Z]{1,3}\d{2}$/.test(ref) || ref.endsWith('00') || ref.startsWith('000')) continue   // no room number / odd address — leave for a person
    const { error } = await s.from('tenancies').update({ payment_reference: ref }).eq('id', t.id)
    if (!error) filled++
  }
  return NextResponse.json({ ok: true, filled, skipped: tens.length - filled })
}
