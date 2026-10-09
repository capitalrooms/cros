/**
 * /api/admin/lettings/[tenancyId] — the letting file.
 *   GET                                         → { file } (lib/lettings/lettingFile)
 *   PATCH { action: 'step', step, date?, undo?, scheme?, schemeRef?, rightToRentUntil? }
 *                                               → ticks a step off (or undoes it), logged in the file's activity.
 *                                                 Move-in monies received also applies the held holding deposit.
 *   PATCH { action: 'terms', changes: {…} }      → edits the terms (rent, dates, deposit, reference only before move-in)
 *   PATCH { action: 'cancel', reason }           → the let fell through: kept on record, off every current list,
 *                                                 the room goes back on the market
 *   PATCH { action: 'move_room', roomId, oldRoom: 'available'|'leave', reason? }
 *                                               → put on the wrong room: moves it and its references to the right one
 *   PATCH { action: 'remove_mistake', reason?, oldRoom? } → added by mistake: kept on record, off every list
 *   PATCH { action: 'delete', reason }            → entered in error: deleted, full copy in the finance audit log (admins)
 *                                                 (all three only on the day it was added or while nothing financial is attached)
 * Office and lettings staff only. Nothing here sends anything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadLettingFile, stageOf, STEP_COLUMNS, STEP_NAMES, type StepKey } from '@/lib/lettings/lettingFile'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { alertLettingsRoomUp } from '@/lib/lettings/roomAlert'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'
import { roomCode } from '@/lib/references'
import { canUndoTenancy } from '@/lib/lettings/undo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ISO = /^\d{4}-\d{2}-\d{2}$/
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// Terms that can be edited, and whether only before move-in (money and dates the rent schedule runs on)
const TERMS: Record<string, { label: string; beforeMoveIn: boolean; kind: 'date' | 'money' | 'int' | 'text' }> = {
  start_date: { label: 'Start date', beforeMoveIn: true, kind: 'date' },
  rent_amount: { label: 'Rent', beforeMoveIn: true, kind: 'money' },
  rent_due_day: { label: 'Rent due day', beforeMoveIn: true, kind: 'int' },
  deposit_amount: { label: 'Deposit', beforeMoveIn: true, kind: 'money' },
  payment_reference: { label: 'Payment reference', beforeMoveIn: true, kind: 'text' },
  agreement_type: { label: 'Agreement type', beforeMoveIn: true, kind: 'text' },
  notice_period_months: { label: 'Notice period (months)', beforeMoveIn: false, kind: 'int' },
  special_clauses: { label: 'Special clauses', beforeMoveIn: false, kind: 'text' },
  permitted_occupiers: { label: 'Permitted occupiers', beforeMoveIn: false, kind: 'text' },
  office_notes: { label: 'Office notes', beforeMoveIn: false, kind: 'text' },
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const r = await loadLettingFile(createServiceClient(), tenancyId)
  if (!r.file) return NextResponse.json({ error: r.error }, { status: r.error === 'Tenancy not found' ? 404 : 500 })
  return NextResponse.json({ file: r.file })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: t } = await s.from('tenancies').select('id, room_id, start_date, end_date, notice_received_date, let_cancelled_at, applicant_id, created_at').eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const today = todayIso()

  if (b.action === 'step') {
    const step = String(b.step ?? '') as StepKey
    const col = STEP_COLUMNS[step]
    if (!col) return NextResponse.json({ error: 'Unknown step' }, { status: 400 })
    if (t.let_cancelled_at) return NextResponse.json({ error: 'This let fell through — it can’t be updated' }, { status: 409 })
    const date = b.undo ? null : String(b.date || today)
    if (date && !ISO.test(date)) return NextResponse.json({ error: 'Enter a valid date' }, { status: 400 })
    if (date && date > today) return NextResponse.json({ error: 'That date is in the future' }, { status: 400 })
    const update: Record<string, unknown> = { [col]: date }
    if (step === 'deposit_protected' && !b.undo) {
      if (b.scheme) update.deposit_scheme = String(b.scheme).slice(0, 60)
      if (b.schemeRef) update.deposit_scheme_ref = String(b.schemeRef).slice(0, 80)
    }
    const { error } = await s.from('tenancies').update(update).eq('id', tenancyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    let extra = ''
    if (step === 'right_to_rent' && !b.undo && b.rightToRentUntil && ISO.test(String(b.rightToRentUntil))) {
      const { data: tt } = await s.from('tenancies').select('person_id').eq('id', tenancyId).single()
      await s.from('people').update({ right_to_rent_until: b.rightToRentUntil }).eq('id', tt!.person_id)
      extra = ` — time-limited, recheck by ${longDate(String(b.rightToRentUntil))}`
    }
    // the move-in monies include the holding deposit: once they're in, the holding deposit has been applied (final)
    if (step === 'monies' && !b.undo) {
      const { data: held } = await s.from('holding_deposits').select('id, hold_no, received_on').eq('tenancy_id', tenancyId).eq('status', 'held')
      for (const h of held ?? []) {
        const { error: hErr } = await s.from('holding_deposits').update({
          status: 'applied', outcome_on: date! < h.received_on ? h.received_on : date, outcome_by: caller.email, outcome_at: new Date().toISOString(),
          outcome_reason: 'Put towards the move-in monies',
        }).eq('id', h.id)
        extra += hErr ? ` (holding deposit ${h.hold_no} not marked applied: ${hErr.message})` : ` — holding deposit ${h.hold_no} applied`
      }
    }
    if (step === 'deposit_protected' && !b.undo && (b.scheme || b.schemeRef)) extra += ` — ${[b.scheme, b.schemeRef].filter(Boolean).join(' ')}`
    await logTenancyEvent(s, tenancyId, b.undo ? `undone:${step}` : `step:${step}`, b.undo ? `${STEP_NAMES[step]} — undone` : `${STEP_NAMES[step]} ${longDate(date!)}${extra}`, caller.email)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'terms') {
    const changes = (b.changes && typeof b.changes === 'object' ? b.changes : {}) as Record<string, unknown>
    const beforeMoveIn = stageOf(t, today) === 'let_agreed'
    const update: Record<string, unknown> = {}
    const notes: string[] = []
    const { data: cur } = await s.from('tenancies').select(Object.keys(TERMS).join(', ')).eq('id', tenancyId).single() as { data: any }
    for (const [k, raw] of Object.entries(changes)) {
      const def = TERMS[k]
      if (!def) continue
      // a wrong payment reference can be corrected after move-in, with the reason kept (bank payments are matched on it)
      const correcting = k === 'payment_reference' && !beforeMoveIn && String(b.reason ?? '').trim().length > 0
      if (def.beforeMoveIn && !beforeMoveIn && !correcting) return NextResponse.json({ error: k === 'payment_reference' ? 'Say why the payment reference is being corrected' : `${def.label} can only be changed before move-in. Use a rent review or a new agreement.` }, { status: 409 })
      let v: unknown = raw
      if (def.kind === 'date') { v = String(raw ?? ''); if (!ISO.test(v as string)) return NextResponse.json({ error: `${def.label}: enter a valid date` }, { status: 400 }) }
      if (def.kind === 'money') { v = raw === '' || raw == null ? null : Math.round(Number(String(raw).replace(/[£,\s]/g, '')) * 100) / 100; if (v != null && !((v as number) >= 0)) return NextResponse.json({ error: `${def.label}: enter an amount` }, { status: 400 }) }
      if (def.kind === 'int') { v = raw === '' || raw == null ? null : parseInt(String(raw), 10); if (v != null && !Number.isFinite(v as number)) return NextResponse.json({ error: `${def.label}: enter a number` }, { status: 400 }) }
      if (def.kind === 'text') v = String(raw ?? '').trim().slice(0, 4000) || null
      if (k === 'payment_reference' && v) { v = String(v).toUpperCase().replace(/\s+/g, ''); if (!/^[A-Z0-9\-\/]{3,18}$/.test(v as string)) return NextResponse.json({ error: 'Payment reference: letters and numbers only (3–18)' }, { status: 400 }) }
      if (k === 'rent_due_day' && v != null && ((v as number) < 1 || (v as number) > 28)) return NextResponse.json({ error: 'Rent due day must be 1–28' }, { status: 400 })
      if (String(cur?.[k] ?? '') === String(v ?? '')) continue
      update[k] = v
      notes.push(k === 'office_notes' || k === 'special_clauses' || k === 'permitted_occupiers' ? `${def.label} updated` : `${def.label}: ${cur?.[k] ?? '—'} → ${v ?? '—'}${k === 'payment_reference' && !beforeMoveIn ? ` (corrected: ${String(b.reason).trim().slice(0, 300)})` : ''}`)
    }
    if (!notes.length) return NextResponse.json({ ok: true, unchanged: true })
    const { error } = await s.from('tenancies').update(update).eq('id', tenancyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await logTenancyEvent(s, tenancyId, 'terms', notes.join(' · '), caller.email)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'cancel') {
    const reason = String(b.reason ?? '').trim().slice(0, 500)
    if (!reason) return NextResponse.json({ error: 'Say why it fell through — it stays on the record' }, { status: 400 })
    if (t.let_cancelled_at) return NextResponse.json({ error: 'Already marked as fallen through' }, { status: 409 })
    if (stageOf(t, today) !== 'let_agreed') return NextResponse.json({ error: 'Only a let that hasn’t started can fall through. For a live tenancy, record notice instead.' }, { status: 409 })
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    const { error } = await s.from('tenancies').update({
      let_cancelled_at: new Date().toISOString(), let_cancelled_reason: reason, let_cancelled_by: caller.email, end_date: yesterday,
    }).eq('id', tenancyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    // the room goes back to what it was: on notice if the current tenant is leaving, occupied if someone lives there, else available
    if (t.room_id) {
      const { data: others } = await s.from('tenancies').select('notice_received_date, start_date, end_date').eq('room_id', t.room_id).neq('id', tenancyId)
        .is('let_cancelled_at', null).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`)
      const status = !others?.length ? 'available' : others.some((o: any) => o.notice_received_date) ? 'on_notice' : 'occupied'
      await s.from('rooms').update({ status }).eq('id', t.room_id)
      if (status !== 'occupied') {
        const leaving = (others ?? []).find((o: any) => o.notice_received_date)
        await alertLettingsRoomUp(s, t.room_id, { availableFrom: leaving?.end_date ?? null, why: `A let fell through (${reason}) — back on the market.` })
      }
    }
    if (t.applicant_id) await s.from('applicants').update({ pipeline_stage: 'offer_sent', updated_at: new Date().toISOString() }).eq('id', t.applicant_id)
    await logTenancyEvent(s, tenancyId, 'cancelled', `Let fell through: ${reason}`, caller.email)
    return NextResponse.json({ ok: true })
  }

  // Notice withdrawn (or recorded by mistake): the tenancy runs on, the room shows as occupied again
  if (b.action === 'cancel_notice') {
    if (stageOf(t, today) !== 'on_notice') return NextResponse.json({ error: 'There’s no notice to cancel on this tenancy' }, { status: 409 })
    const reason = String(b.reason ?? '').trim().slice(0, 500)
    const { error } = await s.from('tenancies').update({ end_date: null, notice_received_date: null }).eq('id', tenancyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (t.room_id) {
      // unless someone is already lined up to move in, the room is simply occupied again
      const { data: incoming } = await s.from('tenancies').select('id').eq('room_id', t.room_id).neq('id', tenancyId).is('let_cancelled_at', null).gt('start_date', today).limit(1)
      await s.from('rooms').update({ status: 'occupied' }).eq('id', t.room_id)
      if (incoming?.length) await logTenancyEvent(s, tenancyId, 'notice', 'Heads up: an incoming tenancy is already agreed for this room — check it', caller.email)
    }
    await logTenancyEvent(s, tenancyId, 'notice', `Notice cancelled (was moving out ${t.end_date ? new Date(`${t.end_date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'})${reason ? `: ${reason}` : ''}`, caller.email)
    return NextResponse.json({ ok: true })
  }

  // Put on the wrong room by mistake: move the tenancy (and its references) to the right one.
  // Refused if the new room has someone in it for the same dates, or rent has already been charged on the old room.
  // Only while it's safe: on the day it was added, or while nothing money-related hangs off it (lib/lettings/undo)
  if (b.action === 'move_room' || b.action === 'remove_mistake' || b.action === 'delete') {
    const { data: full } = await s.from('tenancies').select('*').eq('id', tenancyId).single()
    const chk = await canUndoTenancy(s, full, today)
    if (!chk.ok) return NextResponse.json({ error: `This tenancy can’t be ${b.action === 'move_room' ? 'moved' : 'deleted'} because ${chk.reasons.join(', ') || 'it has already been removed'}. End it with notice instead, or ask the office to unwind the money first.` }, { status: 409 })
  }

  // Delete a tenancy entered in error — gone from CROS completely (like 10ninety's delete). Only when nothing financial
  // hangs off it (checked above). A full copy goes to the finance audit log first — who, when, why, and the LETF/DEP
  // numbers it had — so the gap in those number series is explained and the record could be put back.
  if (b.action === 'delete') {
    if (!['administrator', 'admin'].includes(String((caller as any).role))) return NextResponse.json({ error: 'Only an administrator can delete a tenancy' }, { status: 403 })
    const reason = String(b.reason ?? '').trim().slice(0, 300)
    if (reason.length < 3) return NextResponse.json({ error: 'Say why it’s being deleted — it’s kept in the audit log' }, { status: 400 })
    const { data: full } = await s.from('tenancies').select('*, people!person_id(first_name, last_name, email), rooms(name), properties(name)').eq('id', tenancyId).single() as { data: any }
    const { error: logErr } = await s.from('finance_audit_log').insert({
      table_name: 'tenancies', row_id: tenancyId, action: 'delete', actor: caller.email,
      old_row: { ...full, deleted_reason: reason, cancelled_numbers: [full?.letting_fee_no, full?.deposit_no].filter(Boolean) },
    })
    if (logErr) return NextResponse.json({ error: `Not deleted — couldn’t write the audit copy first (${logErr.message})` }, { status: 500 })
    const { error } = await s.from('tenancies').delete().eq('id', tenancyId)
    if (error) return NextResponse.json({ error: `Couldn’t delete: ${error.message}` }, { status: 400 })
    if (t.room_id) {
      const { data: others } = await s.from('tenancies').select('start_date, end_date, notice_received_date').eq('room_id', t.room_id).is('let_cancelled_at', null)
      const live = (others ?? []).filter((o: any) => o.start_date <= today && (!o.end_date || o.end_date >= today))
      await s.from('rooms').update({ status: live.length ? (live.some((o: any) => o.notice_received_date) ? 'on_notice' : 'occupied') : 'available' }).eq('id', t.room_id)
    }
    if (t.applicant_id) await s.from('applicants').update({ pipeline_stage: 'offer_sent', updated_at: new Date().toISOString() }).eq('id', t.applicant_id)
    return NextResponse.json({ ok: true, deleted: true, message: `Deleted. A copy is in the audit log${full?.letting_fee_no || full?.deposit_no ? ` (numbers ${[full?.letting_fee_no, full?.deposit_no].filter(Boolean).join(', ')} cancelled)` : ''}.` })
  }

  // Added by mistake (same day): kept on record with its numbers, but off every list and never counted
  if (b.action === 'remove_mistake') {
    if (t.let_cancelled_at) return NextResponse.json({ error: 'Already removed' }, { status: 409 })
    const [{ data: charged }, { data: held }] = await Promise.all([
      t.room_id && t.start_date ? s.from('rent_charges').select('id').eq('room_id', t.room_id).gte('charge_month', `${t.start_date.slice(0, 7)}-01`).eq('voided', false).gt('amount_received', 0) : Promise.resolve({ data: [] }),
      s.from('holding_deposits').select('hold_no').eq('tenancy_id', tenancyId).neq('status', 'reversed'),
    ]) as { data: any[] | null }[]
    if (charged?.length) return NextResponse.json({ error: 'Rent has already been received against this room. Sort the payment first.' }, { status: 409 })
    if (held?.length) return NextResponse.json({ error: `Holding deposit ${held[0].hold_no} is attached. Deal with it first.` }, { status: 409 })
    const why = String(b.reason ?? '').trim().slice(0, 300)
    const dayBefore = t.start_date ? new Date(Date.parse(`${t.start_date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10) : today
    const { error } = await s.from('tenancies').update({
      let_cancelled_at: new Date().toISOString(), let_cancelled_by: caller.email, let_cancelled_reason: `Added by mistake${why ? `: ${why}` : ''}`, end_date: dayBefore,
    }).eq('id', tenancyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (t.room_id) {
      const { data: others } = await s.from('tenancies').select('start_date, end_date, notice_received_date').eq('room_id', t.room_id).neq('id', tenancyId).is('let_cancelled_at', null)
      const live = (others ?? []).filter((o: any) => o.start_date <= today && (!o.end_date || o.end_date >= today))
      if (b.oldRoom !== 'leave') {
        const status = live.length ? (live.some((o: any) => o.notice_received_date) ? 'on_notice' : 'occupied') : 'available'
        await s.from('rooms').update({ status }).eq('id', t.room_id)
      }
    }
    if (t.applicant_id) await s.from('applicants').update({ pipeline_stage: 'offer_sent', updated_at: new Date().toISOString() }).eq('id', t.applicant_id)
    await logTenancyEvent(s, tenancyId, 'cancelled', `Removed — added by mistake${why ? `: ${why}` : ''}`, caller.email)
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'move_room') {
    const toId = String(b.roomId ?? '')
    if (t.let_cancelled_at) return NextResponse.json({ error: 'This let fell through — it can’t be moved' }, { status: 409 })
    if (!toId || toId === t.room_id) return NextResponse.json({ error: 'Choose the room they actually moved into' }, { status: 400 })
    const [{ data: from }, { data: to }] = await Promise.all([
      s.from('rooms').select('id, name, property_id, properties(name)').eq('id', t.room_id).maybeSingle(),
      s.from('rooms').select('id, name, property_id, status, properties(name, property_code)').eq('id', toId).maybeSingle(),
    ]) as { data: any }[]
    if (!to) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    const end = t.end_date ?? '9999-12-31'
    const { data: clash } = await s.from('tenancies').select('id, start_date, end_date, people!person_id(first_name, last_name)').eq('room_id', toId).neq('id', tenancyId)
      .is('let_cancelled_at', null).lte('start_date', end).or(`end_date.is.null,end_date.gte.${t.start_date}`)
    if (clash?.length) {
      const c = clash[0] as any
      return NextResponse.json({ error: `${to.name} already has ${[c.people?.first_name, c.people?.last_name].filter(Boolean).join(' ') || 'a tenant'} from ${longDate(c.start_date)}${c.end_date ? ` to ${longDate(c.end_date)}` : ''}. Sort that tenancy out first.` }, { status: 409 })
    }
    if (t.room_id && t.start_date) {
      const { data: charged } = await s.from('rent_charges').select('charge_month').eq('room_id', t.room_id).gte('charge_month', `${t.start_date.slice(0, 7)}-01`).eq('voided', false)
      if (charged?.length) return NextResponse.json({ error: `Rent has already been charged on ${from?.name ?? 'the old room'} from ${longDate(charged[0].charge_month)}. Void those charges in the rent roll first, then move the tenancy.` }, { status: 409 })
    }
    const { data: cur } = await s.from('tenancies').select('lease_reference, deposit_reference, holding_deposit_reference, payment_reference').eq('id', tenancyId).single() as { data: any }
    const code = to.properties?.property_code || ''
    const { count } = await s.from('tenancies').select('id', { count: 'exact', head: true }).eq('room_id', toId)
    const seq = String((count ?? 0) + 1).padStart(3, '0'), rc = roomCode(to.name ?? '')
    const update: Record<string, unknown> = { room_id: toId, property_id: to.property_id, payment_reference: buildPaymentRef(to.properties?.name || '', to.name) }
    if (code) Object.assign(update, { lease_reference: `T-${code}-${rc}-${seq}`, deposit_reference: `DEP-${code}-${rc}-${seq}`, holding_deposit_reference: `HD-${code}-${rc}-${seq}` })
    const { error } = await s.from('tenancies').update(update).eq('id', tenancyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await s.from('holding_deposits').update({ room_id: toId, property_id: to.property_id }).eq('tenancy_id', tenancyId)
    // the right room: lived in once the tenancy has started
    if (t.start_date && t.start_date <= today) await s.from('rooms').update({ status: t.notice_received_date ? 'on_notice' : 'occupied', available_date: null }).eq('id', toId)
    // the old room: what its other tenancies say, unless the office says someone still lives there
    let oldNote = ''
    if (t.room_id) {
      const { data: others } = await s.from('tenancies').select('start_date, end_date, notice_received_date').eq('room_id', t.room_id).neq('id', tenancyId).is('let_cancelled_at', null)
      const live = (others ?? []).filter((o: any) => o.start_date <= today && (!o.end_date || o.end_date >= today))
      if (b.oldRoom !== 'leave') {
        const status = live.length ? (live.some((o: any) => o.notice_received_date) ? 'on_notice' : 'occupied') : 'available'
        const lastEnd = (others ?? []).map((o: any) => o.end_date).filter((d: string | null) => d && d < today).sort().pop()
        const availableFrom = lastEnd ? new Date(Date.parse(`${lastEnd}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : today
        await s.from('rooms').update(status === 'available' ? { status, available_date: availableFrom } : { status }).eq('id', t.room_id)
        oldNote = ` · ${from?.name ?? 'Old room'} now ${status === 'available' ? `empty from ${longDate(availableFrom)}` : status.replace('_', ' ')}`
      } else oldNote = ` · ${from?.name ?? 'Old room'} left as it was`
    }
    const why = String(b.reason ?? '').trim().slice(0, 300)
    const refs = [cur?.payment_reference && `payment ref ${cur.payment_reference} → ${update.payment_reference}`, update.lease_reference && `${cur?.lease_reference ?? '—'} → ${update.lease_reference}`].filter(Boolean).join(', ')
    await logTenancyEvent(s, tenancyId, 'terms', `Moved from ${from?.name ?? '—'} to ${to.name}${why ? ` (${why})` : ''} · ${refs}${oldNote}`, caller.email)
    return NextResponse.json({ ok: true, paymentReference: update.payment_reference })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
