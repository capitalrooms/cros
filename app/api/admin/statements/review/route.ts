/**
 * Statements in (13 Nov 2026, Harry: "CROS doesn't really show anywhere to review what has come in to statements@ …
 * it just gets swallowed up … it should be able to receive the statement and let you go through each property and agree
 * if that's what happened for that property in that month via the statement pdf"). Migration 284.
 *   GET ?status=to_review|agreed|all&month=yyyy-mm → the list, newest first, with totals and flags
 *   GET ?id=…                                      → one statement: PDF link, rooms, rent/fee/cost lines, the twin if flagged
 *   POST { id, action: 'agree', note? }            → checked against the PDF: agreed
 *   POST { id, action: 'unagree' }                 → back to "to review"
 *   POST { id, action: 'remove', reason }          → a wrong upload: deleted with its lines, a full copy kept in the
 *                                                    finance audit log first. Refused once approved, sent or paid.
 *   POST { id, action: 'move', propertyId }        → filed under the wrong property: moved, lines and rooms with it
 * Office only (requireAdmin); remove and move are administrators' (the audit log names who).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { viewLink } from '@/lib/files/fileCrypt'

export const dynamic = 'force-dynamic'

const one = (s: unknown) => String(s ?? '').split(/\s*\n\s*/).filter(Boolean).join(', ')
// a statement CROS has paid out on, sent, or approved in its own monthly cycle stays put; an imported one (from the old
// system, often marked as already paid there) can still be removed or moved if it was a wrong upload
const lockedOf = (st: any) => !!(st.payment_run_id || st.sent_at || (st.source !== 'import' && (st.approved_at || Number(st.amount_paid) > 0)))
const notReady = (e: any) => e && /review_status|pdf_path|possible_duplicate_of|received_via/.test(String(e.message ?? ''))

export async function GET(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const { data: st, error } = await s.from('landlord_statements').select('*, properties(id, name, address), people!landlord_id(salutation, first_name, last_name, full_name, company)').eq('id', id).maybeSingle() as { data: any; error: any }
    if (notReady(error)) return NextResponse.json({ setupNeeded: true })
    if (!st) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
    const [{ data: rooms }, { data: lines }, twin] = await Promise.all([
      s.from('landlord_statement_rooms').select('room_number, tenant_name, rent_income, management_fee, letting_fee, other_deductions, net_to_landlord, needs_review').eq('statement_id', id).order('room_number'),
      s.from('statement_line_items').select('description, amount, category, category_type, room_label, ai_confidence').eq('statement_id', id).order('category_type').order('description'),
      st.possible_duplicate_of ? s.from('landlord_statements').select('id, statement_reference, statement_date, gross_rent, net_to_landlord, review_status, created_at').eq('id', st.possible_duplicate_of).maybeSingle() : Promise.resolve({ data: null }),
    ]) as any[]
    // also flag the other way round: an older statement whose newer twin points at it
    const { data: twinOf } = await s.from('landlord_statements').select('id, statement_reference, statement_date, gross_rent, net_to_landlord, review_status, created_at').eq('possible_duplicate_of', id).limit(1)
    const ll = st.people
    return NextResponse.json({
      statement: {
        id: st.id, reference: st.statement_reference, date: st.statement_date, periodStart: st.period_start, periodEnd: st.period_end,
        property: { id: st.property_id, name: one(st.properties?.name || st.properties?.address) },
        landlord: { id: st.landlord_id, name: ll ? ([ll.salutation, ll.first_name, ll.last_name].filter(Boolean).join(' ') || ll.company || ll.full_name) : '' },
        gross: Number(st.gross_rent), fees: Number(st.management_fees) + Number(st.letting_fees ?? 0), costs: Number(st.property_charges), net: Number(st.net_to_landlord),
        status: st.review_status, reviewedAt: st.reviewed_at, reviewedBy: st.reviewed_by, note: st.review_note,
        receivedAt: st.created_at, via: st.received_via ?? st.source ?? null,
        pdf: st.pdf_path ? viewLink('statements', st.pdf_path, 3600) : null,
        locked: lockedOf(st),
      },
      rooms: rooms ?? [], lines: lines ?? [],
      twin: twin?.data ?? (twinOf?.[0] ?? null),
    })
  }

  const status = req.nextUrl.searchParams.get('status') || 'to_review'
  const month = req.nextUrl.searchParams.get('month')
  let q = s.from('landlord_statements').select('id, property_id, landlord_id, statement_reference, statement_date, gross_rent, management_fees, letting_fees, property_charges, net_to_landlord, review_status, reviewed_at, reviewed_by, pdf_path, possible_duplicate_of, created_at, received_via, source, properties(name, address), people!landlord_id(salutation, first_name, last_name, full_name, company)')
    .order('created_at', { ascending: false }).limit(400)
  if (status !== 'all') q = q.eq('review_status', status)
  if (month && /^\d{4}-\d{2}$/.test(month)) q = q.gte('statement_date', `${month}-01`).lte('statement_date', `${month}-31`)
  const { data, error } = await q as { data: any[] | null; error: any }
  if (notReady(error)) return NextResponse.json({ setupNeeded: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { count } = await s.from('landlord_statements').select('id', { count: 'exact', head: true }).eq('review_status', 'to_review')
  const twinIds = new Set((data ?? []).map(r => r.possible_duplicate_of).filter(Boolean))
  return NextResponse.json({
    toReview: count ?? 0,
    statements: (data ?? []).map(r => {
      const ll = r.people
      return {
        id: r.id, propertyId: r.property_id, property: one(r.properties?.name || r.properties?.address),
        landlord: ll ? ([ll.salutation, ll.first_name, ll.last_name].filter(Boolean).join(' ') || ll.company || ll.full_name) : '',
        reference: r.statement_reference, date: r.statement_date, receivedAt: r.created_at, via: r.received_via ?? r.source ?? null,
        gross: Number(r.gross_rent), fees: Number(r.management_fees) + Number(r.letting_fees ?? 0), costs: Number(r.property_charges), net: Number(r.net_to_landlord),
        status: r.review_status, reviewedAt: r.reviewed_at, reviewedBy: r.reviewed_by, hasPdf: !!r.pdf_path,
        duplicate: !!r.possible_duplicate_of || twinIds.has(r.id),
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: st } = await s.from('landlord_statements').select('*').eq('id', String(b.id ?? '')).maybeSingle() as { data: any }
  if (!st) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })

  if (b.action === 'agree' || b.action === 'unagree') {
    const agree = b.action === 'agree'
    const { error } = await s.from('landlord_statements').update(agree
      ? { review_status: 'agreed', reviewed_at: new Date().toISOString(), reviewed_by: me.email, review_note: String(b.note ?? '').trim().slice(0, 500) || null }
      : { review_status: 'to_review', reviewed_at: null, reviewed_by: null }).eq('id', st.id)
    if (notReady(error)) return NextResponse.json({ error: 'Run migration 284 in Supabase first.' }, { status: 503 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // its twin is no longer a question once one of the pair is agreed
    if (agree && st.possible_duplicate_of) await s.from('landlord_statements').update({ possible_duplicate_of: null }).eq('id', st.id)
    return NextResponse.json({ ok: true })
  }

  const locked = lockedOf(st)

  if (b.action === 'remove') {
    if (locked) return NextResponse.json({ error: 'This statement has been approved, sent or paid, so it can’t be removed here — reverse those first.' }, { status: 409 })
    const reason = String(b.reason ?? '').trim().slice(0, 300)
    if (reason.length < 3) return NextResponse.json({ error: 'Say why it’s being removed — it’s kept in the audit log.' }, { status: 400 })
    const [{ data: rooms }, { data: lines }] = await Promise.all([
      s.from('landlord_statement_rooms').select('*').eq('statement_id', st.id),
      s.from('statement_line_items').select('*').eq('statement_id', st.id),
    ])
    const { error: logErr } = await s.from('finance_audit_log').insert({
      table_name: 'landlord_statements', row_id: st.id, action: 'delete', actor: me.email,
      old_row: { ...st, removed_reason: reason, rooms: rooms ?? [], line_items: lines ?? [] },
    })
    if (logErr) return NextResponse.json({ error: `Not removed — couldn’t write the audit copy first (${logErr.message})` }, { status: 500 })
    await s.from('landlord_statements').update({ possible_duplicate_of: null }).eq('possible_duplicate_of', st.id).then(() => null, () => null)
    const e1 = (await s.from('statement_line_items').delete().eq('statement_id', st.id)).error
    const e2 = (await s.from('landlord_statement_rooms').delete().eq('statement_id', st.id)).error
    const e3 = (await s.from('landlord_statements').delete().eq('id', st.id)).error
    const err = e1 || e2 || e3
    if (err) return NextResponse.json({ error: `Couldn’t remove it all: ${err.message}. A full copy is in the audit log.` }, { status: 500 })
    if (st.pdf_path) await s.storage.from('statements').remove([st.pdf_path]).catch(() => null)
    return NextResponse.json({ ok: true, removed: st.statement_reference })
  }

  if (b.action === 'move') {
    if (locked) return NextResponse.json({ error: 'This statement has been approved, sent or paid, so it can’t be moved here.' }, { status: 409 })
    const { data: to } = await s.from('properties').select('id, landlord_id, name').eq('id', String(b.propertyId ?? '')).maybeSingle() as { data: any }
    if (!to) return NextResponse.json({ error: 'Choose the property it belongs to.' }, { status: 400 })
    const { error: logErr } = await s.from('finance_audit_log').insert({ table_name: 'landlord_statements', row_id: st.id, action: 'update', actor: me.email, old_row: { property_id: st.property_id, landlord_id: st.landlord_id, moved_to: to.id } })
    if (logErr) return NextResponse.json({ error: `Not moved — couldn’t write the audit note first (${logErr.message})` }, { status: 500 })
    const set = { property_id: to.id, ...(to.landlord_id ? { landlord_id: to.landlord_id } : {}) }
    const e1 = (await s.from('landlord_statements').update({ ...set, possible_duplicate_of: null }).eq('id', st.id)).error
    const e2 = (await s.from('statement_line_items').update({ ...set, room_id: null }).eq('statement_id', st.id)).error
    const e3 = (await s.from('landlord_statement_rooms').update({ property_id: to.id, room_id: null, tenancy_id: null, tenant_id: null }).eq('statement_id', st.id)).error
    const err = e1 || e2 || e3
    if (err) return NextResponse.json({ error: `Couldn’t move it all: ${err.message}` }, { status: 500 })
    return NextResponse.json({ ok: true, movedTo: one(to.name) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
