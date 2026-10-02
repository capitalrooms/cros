/**
 * /api/admin/lettings/[tenancyId] — the letting file.
 *   GET                                         → { file } (lib/lettings/lettingFile)
 *   PATCH { action: 'step', step, date?, undo?, scheme?, schemeRef?, rightToRentUntil? }
 *                                               → ticks a step off (or undoes it), logged in the file's activity.
 *                                                 Move-in monies received also applies the held holding deposit.
 *   PATCH { action: 'terms', changes: {…} }      → edits the terms (rent, dates, deposit, reference only before move-in)
 *   PATCH { action: 'cancel', reason }           → the let fell through: kept on record, off every current list,
 *                                                 the room goes back on the market
 * Office and lettings staff only. Nothing here sends anything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadLettingFile, stageOf, STEP_COLUMNS, STEP_NAMES, type StepKey } from '@/lib/lettings/lettingFile'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'

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
  const { data: t } = await s.from('tenancies').select('id, room_id, start_date, end_date, notice_received_date, let_cancelled_at, applicant_id').eq('id', tenancyId).maybeSingle() as { data: any }
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
      if (def.beforeMoveIn && !beforeMoveIn) return NextResponse.json({ error: `${def.label} can only be changed before move-in. Use a rent review or a new agreement.` }, { status: 409 })
      let v: unknown = raw
      if (def.kind === 'date') { v = String(raw ?? ''); if (!ISO.test(v as string)) return NextResponse.json({ error: `${def.label}: enter a valid date` }, { status: 400 }) }
      if (def.kind === 'money') { v = raw === '' || raw == null ? null : Math.round(Number(String(raw).replace(/[£,\s]/g, '')) * 100) / 100; if (v != null && !((v as number) >= 0)) return NextResponse.json({ error: `${def.label}: enter an amount` }, { status: 400 }) }
      if (def.kind === 'int') { v = raw === '' || raw == null ? null : parseInt(String(raw), 10); if (v != null && !Number.isFinite(v as number)) return NextResponse.json({ error: `${def.label}: enter a number` }, { status: 400 }) }
      if (def.kind === 'text') v = String(raw ?? '').trim().slice(0, 4000) || null
      if (k === 'rent_due_day' && v != null && ((v as number) < 1 || (v as number) > 28)) return NextResponse.json({ error: 'Rent due day must be 1–28' }, { status: 400 })
      if (String(cur?.[k] ?? '') === String(v ?? '')) continue
      update[k] = v
      notes.push(k === 'office_notes' || k === 'special_clauses' || k === 'permitted_occupiers' ? `${def.label} updated` : `${def.label}: ${cur?.[k] ?? '—'} → ${v ?? '—'}`)
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
    }
    if (t.applicant_id) await s.from('applicants').update({ pipeline_stage: 'offer_sent', updated_at: new Date().toISOString() }).eq('id', t.applicant_id)
    await logTenancyEvent(s, tenancyId, 'cancelled', `Let fell through: ${reason}`, caller.email)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
