// Sorting out rent that didn't arrive as it should (12 Oct 2026, Harry: "it needs to be full proof and allow
// resolutions for when things don't always run to plan"). One place for every fix, each checked, recorded in
// payment_audit_log (migration 218) and on the tenancy's activity:
//   rentPosition     — what a tenant owes (their own charges only — migration 217), what they've paid, plans, history
//   tellTenant       — email and/or text: what's due, month by month, and how to pay (staff-chosen; Settings switch)
//   reverseReceipt   — undo one payment everywhere it went (a bank payment spread over months is undone as a whole)
//   refundOver       — pay back money received over what was due
//   paidDirect       — the tenant paid the landlord directly: the month is settled outside CROS, nobody is paid
//                      twice, and our fee on it goes on the landlord's next statement as a deduction
//   reduceDue        — an agreed reduction or write-off of what's due
//   agreePlan/endPlan — an arrangement to clear arrears (e.g. £50 a month on top of the rent)
// Money already paid over to the landlord is never taken back here — those steps refuse and say why.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ledgerStart } from '@/lib/clientLedger'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { CLIENT_ACCOUNT } from '@/lib/movein/pack'
import { sendEmail } from '@/lib/sendEmail'
import { sendSms } from '@/lib/sms'
import { resolveFee } from '@/lib/fees/managementFee'
import { addLandlordExpense } from '@/lib/expenses/create'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthName = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const RECEIPT_ACTIONS = ['csv_matched', 'manual_allocated', 'fuzzy_confirmed', 'manually_paid']

export const statusFor = (due: number, received: number) => received >= due - 0.005 ? 'paid' : received > 0.005 ? 'partial' : 'pending'

async function audit(s: SupabaseClient, row: { rent_charge_id: string; action: string; by: string; old?: unknown; new?: unknown; note?: string | null; txn?: string | null }) {
  const { error } = await s.from('payment_audit_log').insert({
    rent_charge_id: row.rent_charge_id, action: row.action, performed_by: row.by, performed_at: new Date().toISOString(),
    old_value: row.old ?? null, new_value: row.new ?? null, note: row.note ?? null, bank_transaction_id: row.txn ?? null,
  })
  if (error) throw new Error(`Couldn’t record it in the payment log (${error.message}) — has migration 218 been run?`)
}

export interface Receipt { key: string; date: string | null; amount: number; how: string; txnId: string | null; parts: { chargeId: string; month: string; amount: number }[]; reversed: boolean; paidOver: boolean }
export interface OpenMonth { chargeId: string; month: string; due: number; received: number; outstanding: number; over: number; remitted: number; status: string; note: string | null }

export async function rentPosition(s: SupabaseClient, tenancyId: string) {
  const { data: t } = await s.from('tenancies').select('id, room_id, property_id, start_date, end_date, rent_amount, payment_reference, rent_due_day, management_fee_type, management_fee_pct, management_fee_fixed, people!person_id(id, first_name, last_name, full_name, email, phone), rooms(name), properties(name, address, landlord_id, management_fee_type, management_fee_pct, management_fee_fixed)').eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) throw new Error('Tenancy not found')
  const start = await ledgerStart(s)
  const { data: charges } = await s.from('rent_charges').select('*').eq('room_id', t.room_id).or(`tenancy_id.eq.${t.id},tenancy_id.is.null`)
    .gte('charge_month', start).gte('charge_month', `${String(t.start_date).slice(0, 7)}-01`).order('charge_month')
  const own = ((charges ?? []) as any[]).filter(c => !c.voided && (c.tenancy_id === t.id || !t.end_date || c.charge_month <= t.end_date))
  const months: OpenMonth[] = own.map(c => {
    const due = r2(Number(c.amount_due)), received = r2(Number(c.amount_received || 0))
    return { chargeId: c.id, month: String(c.charge_month).slice(0, 10), due, received, outstanding: r2(Math.max(0, due - received)), over: r2(Math.max(0, received - due)),
      remitted: r2(Number(c.remitted_amount || 0)), status: c.status, note: c.amount_due_note ?? null }
  })
  const ids = own.map(c => c.id)
  const { data: log } = ids.length ? await s.from('payment_audit_log').select('id, rent_charge_id, action, performed_at, old_value, new_value, note, bank_transaction_id').in('rent_charge_id', ids).order('performed_at') : { data: [] as any[] }
  const entries = (log ?? []) as any[]
  // receipts: one per bank payment (however many months it was spread over), or one per payment recorded by hand
  const reversedKeys = new Set(entries.filter(e => e.action === 'payment_reversed').map(e => String(e.new_value?.receipt ?? '')))
  const byKey = new Map<string, Receipt>()
  for (const e of entries.filter(e => RECEIPT_ACTIONS.includes(e.action))) {
    const amount = r2(Number(e.new_value?.this_payment ?? (Number(e.new_value?.amount_received ?? 0) - Number(e.old_value?.amount_received ?? 0))))
    if (!(amount > 0)) continue
    const key = e.bank_transaction_id ? `txn:${e.bank_transaction_id}` : `log:${e.id}`
    const m = months.find(x => x.chargeId === e.rent_charge_id)
    const r = byKey.get(key) ?? { key, date: e.new_value?.payment_date ?? String(e.performed_at).slice(0, 10), amount: 0, how: e.bank_transaction_id ? 'bank' : (e.new_value?.payment_method ?? 'by hand'), txnId: e.bank_transaction_id ?? null, parts: [], reversed: reversedKeys.has(key), paidOver: false }
    r.amount = r2(r.amount + amount)
    r.parts.push({ chargeId: e.rent_charge_id, month: m?.month ?? '', amount })
    byKey.set(key, r)
  }
  const receipts = [...byKey.values()]
  for (const r of receipts) r.paidOver = r.parts.some(p => { const m = months.find(x => x.chargeId === p.chargeId); return !!m && m.remitted > r2(m.received - p.amount) + 0.005 })
  const { data: plans } = await s.from('rent_arrangements').select('*').eq('tenancy_id', t.id).order('created_at', { ascending: false })
  const told = entries.filter(e => e.action === 'tenant_told').map(e => ({ at: e.performed_at, note: e.note })).reverse()
  const owed = r2(months.reduce((n, m) => n + m.outstanding, 0))
  return { tenancy: t, months, receipts: receipts.reverse(), plans: plans ?? [], told, owed, over: r2(months.reduce((n, m) => n + m.over, 0)) }
}

/** The message to the tenant: month by month what's still due, the total, and how to pay. */
export function tenantMessage(pos: Awaited<ReturnType<typeof rentPosition>>, extra = '') {
  const t = pos.tenancy, first = t.people?.first_name || 'there'
  const lines = pos.months.filter(m => m.outstanding > 0.005)
  const rows = lines.map(m => `${monthName(m.month)}: ${gbp(m.due)} due, ${gbp(m.received)} received — ${gbp(m.outstanding)} still to pay`)
  const plan = (pos.plans as any[]).find(p => p.status === 'active')
  const where = `${t.rooms?.name ?? 'your room'}, ${String(t.properties?.name || t.properties?.address || '').split('\n')[0]}`
  const pay = `Account: ${CLIENT_ACCOUNT.name} · Sort code ${CLIENT_ACCOUNT.sortCode} · Account ${CLIENT_ACCOUNT.accountNo} · Reference: ${t.payment_reference ?? 'your usual rent reference'}`
  const text = [
    `Hi ${first}, this is Capital Rooms about the rent for ${where}.`,
    ...rows,
    `Total still to pay: ${gbp(pos.owed)}.`,
    plan ? `As agreed, please pay ${gbp(Number(plan.instalment))} a month on top of your rent until this is cleared.` : 'Please pay this as soon as you can, or reply to let us know when it will be paid.',
    pay,
    extra.trim(),
    'If you think this is wrong — for example you’ve paid in the last couple of days — just reply and we’ll check. Thank you.',
  ].filter(Boolean)
  const html = `<p style="margin:0 0 12px">Hi ${first},</p>
    <p style="margin:0 0 12px">This is a note from Capital Rooms about the rent for <b>${where}</b>.</p>
    <table style="border-collapse:collapse;margin:0 0 12px;font-size:14px">${lines.map(m => `<tr><td style="padding:4px 12px 4px 0">${monthName(m.month)}</td><td style="padding:4px 12px 4px 0">${gbp(m.due)} due</td><td style="padding:4px 12px 4px 0">${gbp(m.received)} received</td><td style="padding:4px 0"><b>${gbp(m.outstanding)} to pay</b></td></tr>`).join('')}</table>
    <p style="margin:0 0 12px"><b>Total still to pay: ${gbp(pos.owed)}</b></p>
    <p style="margin:0 0 12px">${plan ? `As agreed, please pay <b>${gbp(Number(plan.instalment))} a month</b> on top of your rent until this is cleared.` : 'Please pay this as soon as you can, or reply to let us know when it will be paid.'}</p>
    <p style="margin:0 0 12px;padding:10px 12px;background:#f5f3ee;border-radius:8px">${CLIENT_ACCOUNT.name}<br>Sort code ${CLIENT_ACCOUNT.sortCode} · Account ${CLIENT_ACCOUNT.accountNo}<br>Reference: <b>${t.payment_reference ?? 'your usual rent reference'}</b></p>
    ${extra.trim() ? `<p style="margin:0 0 12px">${extra.trim().replace(/</g, '&lt;')}</p>` : ''}
    <p style="margin:0;color:#57534e;font-size:13px">If you think this is wrong — for example you’ve paid in the last couple of days — just reply and we’ll check. Thank you.</p>`
  return { subject: `Rent for ${where}: ${gbp(pos.owed)} still to pay`, html, sms: text.join('\n') }
}

export async function tellTenant(s: SupabaseClient, tenancyId: string, o: { email: boolean; text: boolean; extra?: string; by: { personId: string; email: string }; req?: Request | null }) {
  const pos = await rentPosition(s, tenancyId)
  if (!(pos.owed > 0.005)) throw new Error('Nothing is owed — there’s nothing to tell them.')
  const p = pos.tenancy.people
  if (o.email && !p?.email) throw new Error('They have no email address on file.')
  if (o.text && !p?.phone) throw new Error('They have no mobile number on file.')
  if (!o.email && !o.text) throw new Error('Choose email, text or both.')
  const msg = tenantMessage(pos, o.extra)
  const sent: string[] = []
  if (o.email) { const r = await sendEmail(p.email, msg.subject, msg.html, { req: o.req }); if (!r.ok) throw new Error(`The email didn’t send: ${r.error}`); sent.push('email') }
  if (o.text) { const r = await sendSms(p.phone, msg.sms); if (r.ok) sent.push('text'); else if (!sent.length) throw new Error(`The text didn’t send: ${r.error}`) }
  const open = pos.months.filter(m => m.outstanding > 0.005)
  for (const m of open) await audit(s, { rent_charge_id: m.chargeId, action: 'tenant_told', by: o.by.personId, new: { owed: pos.owed, by: sent }, note: `Tenant told ${gbp(pos.owed)} is still due (${sent.join(' and ')})` })
  await logTenancyEvent(s, tenancyId, 'money', `Told the tenant ${gbp(pos.owed)} rent is still due (${sent.join(' and ')})`, o.by.email)
  return { sent, owed: pos.owed }
}

/** Undo one payment wherever it went. Refuses if any of it has already been paid over to the landlord. */
export async function reverseReceipt(s: SupabaseClient, tenancyId: string, key: string, reason: string, by: { personId: string; email: string }) {
  if (!reason.trim()) throw new Error('Say why it’s being reversed — it stays on the record.')
  const pos = await rentPosition(s, tenancyId)
  const rec = pos.receipts.find(r => r.key === key)
  if (!rec) throw new Error('That payment isn’t on this tenant’s account.')
  if (rec.reversed) throw new Error('That payment has already been reversed.')
  if (rec.paidOver) throw new Error('Some of this payment has already been paid over to the landlord on a statement, so it can’t simply be reversed. Record the correction on the landlord’s next statement instead (Finance › Statements).')
  // take each part back off its month, then put the bank line back to be matched again
  for (const part of rec.parts) {
    const { data: c } = await s.from('rent_charges').select('id, amount_due, amount_received, status, remitted_amount').eq('id', part.chargeId).single()
    if (!c) continue
    const received = r2(Math.max(0, Number(c.amount_received) - part.amount))
    if (Number(c.remitted_amount || 0) > received + 0.005) throw new Error('Part of this payment has been paid over to the landlord meanwhile — nothing was changed.')
    const status = statusFor(Number(c.amount_due), received)
    const { error } = await s.from('rent_charges').update({ amount_received: received, status, ...(received <= 0 ? { received_date: null, bank_transaction_id: null } : {}) }).eq('id', c.id)
    if (error) throw new Error(error.message)
    await audit(s, { rent_charge_id: c.id, action: 'payment_reversed', by: by.personId, old: { amount_received: c.amount_received, status: c.status }, new: { amount_received: received, status, receipt: key, this_payment: -part.amount }, note: reason.trim(), txn: rec.txnId })
  }
  if (rec.txnId) await s.from('bank_transactions').update({ status: 'unmatched', matched_rent_charge_id: null, matched_at: null, matched_by: null }).eq('id', rec.txnId)
  await logTenancyEvent(s, tenancyId, 'money', `Payment of ${gbp(rec.amount)} (${rec.date ?? ''}) reversed: ${reason.trim()}${rec.txnId ? ' — the bank line is back in Bank & Matching to put right' : ''}`, by.email)
  return { amount: rec.amount, backToMatching: !!rec.txnId }
}

/** Pay back money received over what was due on a month (not yet paid over to the landlord). */
export async function refundOver(s: SupabaseClient, tenancyId: string, chargeId: string, amount: number, reason: string, by: { personId: string; email: string }) {
  const pos = await rentPosition(s, tenancyId)
  const m = pos.months.find(x => x.chargeId === chargeId)
  if (!m) throw new Error('That month isn’t on this tenant’s account.')
  amount = r2(amount)
  if (!(amount > 0) || amount > m.over + 0.005) throw new Error(`Only ${gbp(m.over)} was paid over what was due that month.`)
  if (m.remitted > r2(m.received - amount) + 0.005) throw new Error('That money has already been paid over to the landlord, so it can’t be refunded from here.')
  if (!reason.trim()) throw new Error('Say how it was refunded (e.g. “bank transfer to the tenant on 14 Oct”).')
  const received = r2(m.received - amount)
  const { error } = await s.from('rent_charges').update({ amount_received: received, status: statusFor(m.due, received) }).eq('id', chargeId)
  if (error) throw new Error(error.message)
  await audit(s, { rent_charge_id: chargeId, action: 'refunded', by: by.personId, old: { amount_received: m.received }, new: { amount_received: received, refunded: amount }, note: reason.trim() })
  await logTenancyEvent(s, tenancyId, 'money', `Overpayment of ${gbp(amount)} for ${monthName(m.month)} refunded to the tenant: ${reason.trim()}`, by.email)
  return { refunded: amount }
}

/** The tenant paid the landlord directly. The month counts as settled outside CROS (nobody is paid twice); our fee on
 *  it is added to the landlord's next statement as a deduction, if chosen. */
export async function paidDirect(s: SupabaseClient, tenancyId: string, chargeId: string, o: { amount: number; date: string; note: string; takeFee: boolean; by: { personId: string; email: string } }) {
  const pos = await rentPosition(s, tenancyId)
  const m = pos.months.find(x => x.chargeId === chargeId)
  if (!m) throw new Error('That month isn’t on this tenant’s account.')
  const amount = r2(o.amount)
  if (!(amount > 0) || amount > m.outstanding + 0.005) throw new Error(`Only ${gbp(m.outstanding)} is still due for ${monthName(m.month)}.`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) throw new Error('Enter the date they paid the landlord.')
  const { data: c } = await s.from('rent_charges').select('amount_due, amount_due_original, amount_due_note, amount_received, status').eq('id', chargeId).single()
  // our fee on it, worked out before anything changes (so a missing fee stops it cleanly)
  const t = pos.tenancy
  const f = resolveFee(t, t.properties)
  if (o.takeFee && f.source === 'none') throw new Error('No management fee is set for this tenancy or property, so none can be charged on it. Untick “charge our fee” or set the fee first.')
  const fee = !o.takeFee ? 0 : f.type === 'fixed' ? r2((f.fixed ?? 0) * amount / Number(c!.amount_due)) : r2(amount * (f.pct ?? 0) / 100)
  const due = r2(Number(c!.amount_due) - amount)
  const note = [c!.amount_due_note, `${gbp(amount)} paid by the tenant directly to the landlord on ${o.date.split('-').reverse().join('/')}`].filter(Boolean).join('; ')
  const status = statusFor(due, Number(c!.amount_received || 0))
  const { error } = await s.from('rent_charges').update({ amount_due: due, amount_due_original: c!.amount_due_original ?? c!.amount_due, amount_due_note: note, amount_due_changed_at: new Date().toISOString(), amount_due_changed_by: o.by.personId, status }).eq('id', chargeId)
  if (error) throw new Error(error.message)
  if (fee > 0) {
    const r = await addLandlordExpense(s, {
      property_id: t.property_id, room_id: t.room_id, amount: fee, expense_date: o.date, supplier: 'Capital Rooms Ltd', category: 'Management fee',
      description: `Management fee on ${gbp(amount)} rent paid to you directly (${t.rooms?.name ?? 'room'}, ${monthName(m.month)})`,
      notes: o.note || null,
    }, { by: o.by.email, confirmDuplicate: true })
    if (!r.ok) throw new Error(`The month is settled, but the fee couldn’t be added (${r.error ?? 'a possible duplicate'}) — add it in Finance › Expenses.`)
  }
  await audit(s, { rent_charge_id: chargeId, action: 'paid_direct', by: o.by.personId, old: { amount_due: c!.amount_due }, new: { amount_due: due, paid_direct: amount, date: o.date, fee }, note: o.note || null })
  await logTenancyEvent(s, tenancyId, 'money', `${gbp(amount)} of ${monthName(m.month)} rent paid directly to the landlord on ${o.date}${fee ? `; our fee of ${gbp(fee)} goes on their next statement` : ''}${o.note ? ` — ${o.note}` : ''}`, o.by.email)
  return { settled: amount, fee }
}

/** An agreed reduction or write-off of what's due for a month. */
export async function reduceDue(s: SupabaseClient, tenancyId: string, chargeId: string, newDue: number, reason: string, by: { personId: string; email: string }) {
  if (!reason.trim()) throw new Error('Say why (e.g. “landlord agreed £50 off for the broken boiler”).')
  const pos = await rentPosition(s, tenancyId)
  const m = pos.months.find(x => x.chargeId === chargeId)
  if (!m) throw new Error('That month isn’t on this tenant’s account.')
  newDue = r2(newDue)
  if (!(newDue >= 0) || newDue >= m.due) throw new Error(`Enter a new amount below ${gbp(m.due)}.`)
  const { data: c } = await s.from('rent_charges').select('amount_due, amount_due_original, amount_due_note, amount_received').eq('id', chargeId).single()
  const status = statusFor(newDue, Number(c!.amount_received || 0))
  const note = [c!.amount_due_note, `reduced from ${gbp(m.due)} to ${gbp(newDue)}: ${reason.trim()}`].filter(Boolean).join('; ')
  const { error } = await s.from('rent_charges').update({ amount_due: newDue, amount_due_original: c!.amount_due_original ?? c!.amount_due, amount_due_note: note, amount_due_changed_at: new Date().toISOString(), amount_due_changed_by: by.personId, status: newDue === 0 && Number(c!.amount_received || 0) === 0 ? 'waived' : status }).eq('id', chargeId)
  if (error) throw new Error(error.message)
  await audit(s, { rent_charge_id: chargeId, action: 'amount_due_edited', by: by.personId, old: { amount_due: m.due }, new: { amount_due: newDue }, note: reason.trim() })
  await logTenancyEvent(s, tenancyId, 'money', `${monthName(m.month)} rent reduced from ${gbp(m.due)} to ${gbp(newDue)}: ${reason.trim()}`, by.email)
  return { from: m.due, to: newDue }
}

export async function agreePlan(s: SupabaseClient, tenancyId: string, o: { instalment: number; startsOn: string; note: string; by: { personId: string; email: string } }) {
  const pos = await rentPosition(s, tenancyId)
  if (!(pos.owed > 0.005)) throw new Error('Nothing is owed, so there’s nothing to arrange.')
  if (!(o.instalment > 0)) throw new Error('Enter how much extra they’ll pay each month.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.startsOn)) throw new Error('Enter the date the plan starts.')
  if ((pos.plans as any[]).some(p => p.status === 'active')) throw new Error('There’s already a plan running — end it first.')
  const { data, error } = await s.from('rent_arrangements').insert({ tenancy_id: tenancyId, arrears: pos.owed, instalment: r2(o.instalment), starts_on: o.startsOn, note: o.note || null, created_by: o.by.email }).select('id').single()
  if (error) throw new Error(`${error.message}${/rent_arrangements/.test(error.message) ? ' — has migration 218 been run?' : ''}`)
  const months = Math.ceil(pos.owed / o.instalment)
  for (const m of pos.months.filter(x => x.outstanding > 0.005)) await audit(s, { rent_charge_id: m.chargeId, action: 'arrangement', by: o.by.personId, new: { plan: data.id, instalment: o.instalment, starts_on: o.startsOn }, note: `Payment plan: ${gbp(o.instalment)} a month from ${o.startsOn}` })
  await logTenancyEvent(s, tenancyId, 'money', `Payment plan agreed: ${gbp(pos.owed)} owed, ${gbp(o.instalment)} a month on top of the rent from ${o.startsOn} (about ${months} month${months === 1 ? '' : 's'})${o.note ? ` — ${o.note}` : ''}`, o.by.email)
  return { id: data.id, months }
}

export async function endPlan(s: SupabaseClient, tenancyId: string, planId: string, outcome: 'completed' | 'broken' | 'cancelled', note: string, by: { personId: string; email: string }) {
  const { data: p } = await s.from('rent_arrangements').select('id, tenancy_id, status').eq('id', planId).maybeSingle()
  if (!p || p.tenancy_id !== tenancyId) throw new Error('That plan isn’t on this tenancy.')
  if (p.status !== 'active') throw new Error('That plan has already ended.')
  const { error } = await s.from('rent_arrangements').update({ status: outcome, ended_at: new Date().toISOString(), ended_note: note || null }).eq('id', planId)
  if (error) throw new Error(error.message)
  await logTenancyEvent(s, tenancyId, 'money', `Payment plan ${outcome === 'completed' ? 'completed' : outcome === 'broken' ? 'broken (not kept to)' : 'cancelled'}${note ? ` — ${note}` : ''}`, by.email)
  return { ok: true }
}
