// POST /api/admin/lettings/<tenancyId>/move-tenancy — a tenant moves to another room (24 Nov 2026).
// Body: { roomId, moveDate (YYYY-MM-DD, the first day in the new room), rentAmount (the new room's rent),
//         deposit: 'carry' | 'retake', reason? }   (no top-up: a bigger room's deposit is never asked for on a move)
//
// What happens (all or nothing — checked first, then written):
//   • The old tenancy ends the day before the move. Its rent for the move month is re-raised pro rata to the move date.
//   • A new tenancy starts on the move date in the new room, at the new rent. Its rent is pro rata from the move date.
//   • carry: the deposit (scheme, reference, protection date) moves to the new tenancy; a top-up is added to its amount.
//            Prescribed information must be served again for the new tenancy.
//   • retake: nothing carries. The old deposit is returned with the existing deposit return, and a new one is taken.
//   • Refused if money has already come in on the old tenancy's charges from the move month (void or refund them first).
// Nothing is sent to the tenant. Staff only.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'
import { roomCode } from '@/lib/references'
import { ensureTenancyCharge } from '@/lib/rentCharges/generate'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayBefore = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

  const roomId = String(b.roomId ?? ''), moveDate = String(b.moveDate ?? '')
  const rentAmount = r2(Number(b.rentAmount))
  const deposit = b.deposit === 'retake' ? 'retake' : b.deposit === 'carry' ? 'carry' : null
  const reason = String(b.reason ?? '').trim().slice(0, 300)
  if (!roomId) return fail('Choose the room they moved into')
  if (!ISO.test(moveDate)) return fail('Enter the move date')
  if (!(rentAmount > 0)) return fail('Enter the rent for the new room')
  // DPS requires the deposit to be refunded and taken again when a tenant changes room (confirmed 24 Nov 2026)
  if (String(deposit) === 'carry') return fail('DPS requires the deposit to be refunded and taken again when a tenant changes room. Choose “refund and take a new one”.', 409)
  if (!deposit) return fail('Choose what happens to the deposit')

  // ── the old tenancy ─────────────────────────────────────────────────────────────────────────────────────────────
  const { data: t } = await s.from('tenancies').select('*').eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) return fail('Tenancy not found', 404)
  if (t.let_cancelled_at) return fail('This let fell through — it can’t be moved', 409)
  if (t.co_tenant_id) return fail('This tenancy has a joint tenant. Move the tenancy with the joint tenant taken off first — this isn’t done in one step yet.', 409)
  if (!t.person_id) return fail('This tenancy has no tenant on it')
  if (!t.start_date || moveDate <= t.start_date) return fail(`They move in on ${t.start_date ? longDate(t.start_date) : 'a date not yet set'}, so a move has to be after that. For a wrong room on the first day, use “Move to the right room”.`)
  if (t.end_date && moveDate > t.end_date) return fail(`This tenancy ends ${longDate(t.end_date)}, before the move date.`)
  if (t.room_id === roomId) return fail('They are already in that room')

  // ── the new room ────────────────────────────────────────────────────────────────────────────────────────────────
  const { data: to } = await s.from('rooms').select('id, name, property_id, unit_code, properties(name, property_code)').eq('id', roomId).maybeSingle() as { data: any }
  if (!to) return fail('Room not found', 404)
  const { data: clash } = await s.from('tenancies').select('id, start_date, end_date, people!person_id(first_name, last_name)').eq('room_id', roomId).neq('id', tenancyId)
    .is('let_cancelled_at', null).lte('start_date', t.end_date ?? '9999-12-31').or(`end_date.is.null,end_date.gte.${moveDate}`)
  if (clash?.length) {
    const c = clash[0] as any
    return fail(`${to.name} already has ${[c.people?.first_name, c.people?.last_name].filter(Boolean).join(' ') || 'a tenant'} from ${longDate(c.start_date)}${c.end_date ? ` to ${longDate(c.end_date)}` : ''}. Sort that out first.`, 409)
  }
  // the same person can't have two tenancies running at once (lib/lettings/incomingTenancy)
  const { data: other } = await s.from('tenancies').select('id').eq('person_id', t.person_id).neq('id', tenancyId).is('let_cancelled_at', null)
    .or(`end_date.is.null,end_date.gte.${moveDate}`).limit(1)
  if (other?.length) return fail('This person already has another tenancy running from that date. Check their tenancies first.', 409)

  // ── rent already taken for the move month and after on the old tenancy ───────────────────────────────────────
  const moveMonth = `${moveDate.slice(0, 7)}-01`
  const { data: charges } = await s.from('rent_charges').select('id, charge_month, amount_received, remitted_statement_id').eq('tenancy_id', tenancyId).eq('voided', false).gte('charge_month', moveMonth)
  const paid = (charges ?? []).filter((c: any) => Number(c.amount_received || 0) > 0)
  if (paid.length) return fail(`Money has already come in on the rent for ${longDate(paid[0].charge_month)}. Refund or reallocate that rent first, then move them.`, 409)
  // a landlord statement has already paid out on it: voiding would unbalance that statement, so it has to be corrected there
  const sent = (charges ?? []).filter((c: any) => c.remitted_statement_id)
  if (sent.length) return fail(`The rent for ${longDate(sent[0].charge_month)} is already on a landlord statement. Correct that statement first, then move them.`, 409)

  // ── deposit ───────────────────────────────────────────────────────────────────────────────────────────────────
  const oldDeposit = r2(Number(t.deposit_amount || 0))
    // Ledger-tricky: a carry-over only moves the same deposit when the old one is cleanly held. Anything less clean is
  // refunded and taken again (the office's rule), so the books never have to explain one deposit as two.
  const tricky = !!(t.deposit_sent_on || t.deposit_release_status || !t.deposit_protected_at || !t.deposit_received_on
    || r2(Number(t.deposit_received_amount ?? 0)) !== oldDeposit)
  if (deposit === 'carry' && oldDeposit > 0 && tricky) return fail('This deposit isn’t cleanly held (not protected, not fully received, or already part-sent). Refund it and take a new one instead.', 409)
  if (deposit === 'retake' && t.deposit_release_status === 'released') return fail('This deposit has already been released.', 409)

  // ── the new tenancy's references (same pattern as the wrong-room move) ──────────────────────────────────────
  const code = to.properties?.property_code || ''
  const { count } = await s.from('tenancies').select('id', { count: 'exact', head: true }).eq('room_id', roomId)
  const seq = String((count ?? 0) + 1).padStart(3, '0'), rc = roomCode(to.name ?? '')
  const newRow: Record<string, unknown> = {
    person_id: t.person_id, property_id: to.property_id, room_id: roomId, start_date: moveDate, end_date: null,
    rent_amount: rentAmount, rent_due_day: t.rent_due_day, agreement_type: t.agreement_type ?? null,
    payment_reference: buildPaymentRef(to.properties?.name || '', to.name),
    notice_period_months: t.notice_period_months ?? null, permitted_occupiers: t.permitted_occupiers ?? null,
  }
  if (code) Object.assign(newRow, { lease_reference: `T-${code}-${rc}-${seq}`, deposit_reference: `DEP-${code}-${rc}-${seq}`, holding_deposit_reference: `HD-${code}-${rc}-${seq}` })
  // carried over: it's the SAME deposit, so the new tenancy only carries its reference. It gets no amount and no
  // "received" date — the books and the client account count a deposit once, on the tenancy that took it. The new
  // tenancy shows the deposit as paid by pointing at that reference. Prescribed information is served again.
  if (deposit === 'carry') Object.assign(newRow, {
    deposit_reference: t.deposit_reference ?? null,
    deposit_no: t.deposit_no ?? null,            // the same DEP number: the money keeps its number when it moves
    prescribed_info_served_at: null,
  })
  const { data: created, error: insErr } = await s.from('tenancies').insert(newRow).select('id').single() as { data: any; error: any }
  if (insErr || !created) return fail(insErr?.message || 'Could not start the new tenancy', 400)
  const newId = created.id

  // the deposit trail (migration 303): a carry is a transfer out of the old tenancy and into the new one — the same money,
  // the same DEP number; a refund and retake is a return owed on the old tenancy. Written before anything else changes.
  if (oldDeposit > 0 && t.deposit_no) {
    const trail: Record<string, unknown>[] = deposit === 'carry'
      ? [
          { deposit_no: t.deposit_no, kind: 'transferred_out', amount: oldDeposit, event_on: moveDate, tenancy_id: tenancyId, to_tenancy_id: newId, reference: t.deposit_scheme_ref ?? null, note: `Moved to ${to.name}`, created_by: caller.email ?? null },
          { deposit_no: t.deposit_no, kind: 'transferred_in', amount: oldDeposit, event_on: moveDate, tenancy_id: newId, from_tenancy_id: tenancyId, reference: t.deposit_scheme_ref ?? null, note: `Moved from the previous room`, created_by: caller.email ?? null },
        ]
      : [{ deposit_no: t.deposit_no, kind: 'return_agreed', amount: oldDeposit, event_on: moveDate, tenancy_id: tenancyId, reference: t.deposit_no, note: `Refund on moving to ${to.name} — refund and take a new deposit`, created_by: caller.email ?? null }]
    const { error: trailErr } = await s.from('deposit_events').insert(trail)
    if (trailErr) {
      await s.from('tenancies').delete().eq('id', newId)
      const missing = /deposit_events/.test(trailErr.message)
      return fail(missing ? 'Run migration 303 (deposit events) in Supabase before moving a deposit.' : trailErr.message)
    }
  }

  // refund and take again: the old deposit is owed back to the tenant in full, recorded as a deposit return (DEPR) on the
  // old tenancy, agreed but not yet paid. It's marked returned once the bank refund has gone out (deposit-returns route).
  if (deposit === 'retake' && oldDeposit > 0) {
    const { data: existingRet } = await s.from('deposit_returns').select('id, status').eq('tenancy_id', tenancyId).maybeSingle()
    if (existingRet?.status === 'returned') { await s.from('tenancies').delete().eq('id', newId); return fail('This deposit has already been returned.', 409) }
    const retRow = {
      tenancy_id: tenancyId, deposit_amount: oldDeposit, deductions: [], to_landlord: 0, to_tenant: oldDeposit, status: 'agreed',
      scheme: t.deposit_scheme ?? null, notes: `Refund on moving to ${to.name} from ${longDate(moveDate)} — refund and take a new deposit.`, updated_at: new Date().toISOString(),
    }
    const res = existingRet ? await s.from('deposit_returns').update(retRow).eq('id', existingRet.id) : await s.from('deposit_returns').insert(retRow)
    if (res.error) { await s.from('tenancies').delete().eq('id', newId); return fail(res.error.message) }
  }

  // ── the old tenancy: end it, re-raise the move month pro rata, free the old room ─────────────────────────────
  const endOld = dayBefore(moveDate)
  const { error: endErr } = await s.from('tenancies').update({ end_date: endOld }).eq('id', tenancyId)
  if (endErr) { await s.from('tenancies').delete().eq('id', newId); return fail(endErr.message) }
  const toVoid = (charges ?? []).map((c: any) => c.id)
  if (toVoid.length) await s.from('rent_charges').update({ voided: true, void_reason: `Moved to another room from ${longDate(moveDate)}` }).in('id', toVoid)
  await ensureTenancyCharge(s as any, tenancyId, moveMonth)
  await ensureTenancyCharge(s as any, newId, moveMonth)

  const today = todayIso()
  if (t.room_id) {
    const { data: others } = await s.from('tenancies').select('id, start_date, end_date').eq('room_id', t.room_id).neq('id', tenancyId).is('let_cancelled_at', null)
    const liveElsewhere = (others ?? []).some((o: any) => o.start_date <= today && (!o.end_date || o.end_date >= today))
    if (!liveElsewhere) await s.from('rooms').update({ status: 'available', available_date: moveDate }).eq('id', t.room_id)
  }
  await s.from('rooms').update({ status: 'occupied', available_date: null }).eq('id', roomId)

  // ── the record ────────────────────────────────────────────────────────────────────────────────────────────────
  const who = caller.email ?? null
  const depNote = deposit === 'carry'
    ? `Deposit carried over (£${oldDeposit.toFixed(2)}). Prescribed information must be served again for the new tenancy.`
    : `Deposit not carried over: return the old deposit (£${oldDeposit.toFixed(2)}) with the deposit return, then take and protect a new one.`
  await logTenancyEvent(s as any, tenancyId, 'moved_room', `Moved to ${to.name} from ${longDate(moveDate)}, new tenancy ${newId}. ${depNote}${reason ? ` ${reason}` : ''}`, who)
  await logTenancyEvent(s as any, newId, 'moved_in_from_room', `Moved in from the old room on ${longDate(moveDate)} at £${rentAmount.toFixed(2)} a month. ${depNote}`, who)
  return NextResponse.json({
    ok: true, newTenancyId: newId, endedOn: endOld, startedOn: moveDate,
    nextSteps: deposit === 'retake'
      ? ['Return the old deposit with the deposit return on the old tenancy.', 'Take the new deposit and protect it on the new tenancy.', 'Serve prescribed information for the new tenancy.']
      : ['Serve prescribed information for the new tenancy.'] ,
  })
}
