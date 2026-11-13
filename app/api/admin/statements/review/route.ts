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
import { demoPropertyIds } from '@/lib/demoProperties'

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

  // this month at a glance (13 Nov 2026 tidy): which properties had a statement last month but none yet this month,
  // what's waiting to be checked, and statement lines whose type was never confirmed
  if (req.nextUrl.searchParams.get('coverage')) {
    const now = new Date(), m = req.nextUrl.searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [y, mo] = m.split('-').map(Number)
    const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
    const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
    const { data: rows } = await s.from('landlord_statements').select('property_id, statement_date, statement_reference, review_status, properties(name)').gte('statement_date', `${prev}-01`).lt('statement_date', `${next}-01`) as { data: any[] | null }
    const demo = await demoPropertyIds(s as any)
    const thisMonth = (rows ?? []).filter(r => String(r.statement_date).startsWith(m) && !demo.has(r.property_id))
    const lastMonth = (rows ?? []).filter(r => String(r.statement_date).startsWith(prev) && !demo.has(r.property_id))
    const have = new Set(thisMonth.map(r => r.property_id))
    const missing = [...new Map(lastMonth.filter(r => !have.has(r.property_id)).map(r => [r.property_id, { propertyId: r.property_id, property: one(r.properties?.name), last: String(r.statement_reference ?? '') }])).values()]
    const { count: lines } = await s.from('statement_line_items').select('id', { count: 'exact', head: true }).eq('admin_confirmed', false)
    return NextResponse.json({ month: m, in: have.size, toReview: thisMonth.filter(r => r.review_status === 'to_review').length, missing, linesToConfirm: lines ?? 0 })
  }

  // removed statements that can be put back: the full copy kept in the finance audit log, not back in CROS since
  if (req.nextUrl.searchParams.get('removed')) {
    const { data: log } = await s.from('finance_audit_log').select('id, row_id, actor, at, old_row').eq('table_name', 'landlord_statements').eq('action', 'delete').order('at', { ascending: false }).limit(40) as { data: any[] | null }
    const copies = (log ?? []).filter(l => Array.isArray(l.old_row?.line_items))
    const ids = copies.map(l => l.row_id)
    const { data: back } = ids.length ? await s.from('landlord_statements').select('id').in('id', ids) : { data: [] as any[] }
    const live = new Set((back ?? []).map((x: any) => x.id))
    const props = [...new Set(copies.map(l => l.old_row.property_id).filter(Boolean))]
    const { data: pp } = props.length ? await s.from('properties').select('id, name').in('id', props) : { data: [] as any[] }
    const name = new Map((pp ?? []).map((p: any) => [p.id, one(p.name)]))
    return NextResponse.json({ removed: copies.filter(l => !live.has(l.row_id)).map(l => ({ auditId: l.id, reference: l.old_row.statement_reference, property: name.get(l.old_row.property_id) ?? '', removedAt: l.at, removedBy: l.actor, reason: l.old_row.removed_reason ?? '', gross: Number(l.old_row.gross_rent), lines: l.old_row.line_items.length })) })
  }

  const status = req.nextUrl.searchParams.get('status') || 'to_review'
  const month = req.nextUrl.searchParams.get('month')
  let q = s.from('landlord_statements').select('id, property_id, landlord_id, statement_reference, statement_date, gross_rent, management_fees, letting_fees, property_charges, net_to_landlord, review_status, reviewed_at, reviewed_by, pdf_path, possible_duplicate_of, created_at, received_via, source, properties(name, address), people!landlord_id(salutation, first_name, last_name, full_name, company)')
    .order('created_at', { ascending: false }).limit(400)
  if (status !== 'all') q = q.eq('review_status', status)
  if (month && /^\d{4}-\d{2}$/.test(month)) q = q.gte('statement_date', `${month}-01`).lt('statement_date', (() => { const [y, m] = String(month).split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01` })())
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

  // put a removed statement back exactly as it was, from its audit copy (13 Nov 2026 — the wrong one of a pair can be removed)
  if (b.action === 'restore') {
    const { data: l } = await s.from('finance_audit_log').select('id, row_id, old_row').eq('id', String(b.auditId ?? '')).eq('table_name', 'landlord_statements').eq('action', 'delete').maybeSingle() as { data: any }
    const o = l?.old_row
    if (!o || !Array.isArray(o.line_items)) return NextResponse.json({ error: 'That removed statement can’t be found in the audit log.' }, { status: 404 })
    const { data: there } = await s.from('landlord_statements').select('id').eq('id', l.row_id).maybeSingle()
    if (there) return NextResponse.json({ error: 'It’s already back.' }, { status: 409 })
    const { rooms, line_items, removed_reason, ...row } = o
    const { error: e1 } = await s.from('landlord_statements').insert({ ...row, review_status: 'to_review', reviewed_at: null, reviewed_by: null, possible_duplicate_of: null, pdf_path: null })
    if (e1) return NextResponse.json({ error: `Couldn’t put it back: ${e1.message}` }, { status: 500 })
    const e2 = rooms?.length ? (await s.from('landlord_statement_rooms').insert(rooms)).error : null
    const e3 = line_items.length ? (await s.from('statement_line_items').insert(line_items)).error : null
    if (e2 || e3) return NextResponse.json({ error: `Put back, but some lines didn’t come with it: ${(e2 || e3)!.message}` }, { status: 500 })
    await s.from('finance_audit_log').insert({ table_name: 'landlord_statements', row_id: l.row_id, action: 'insert', actor: me.email, new_row: { restored_from_audit: l.id, statement_reference: o.statement_reference } })
    return NextResponse.json({ ok: true, restored: o.statement_reference, id: l.row_id })
  }

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
