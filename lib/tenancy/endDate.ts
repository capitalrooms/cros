// Changing a tenancy's end date — the same safe steps for every tenancy (Harry, 3 Nov 2026: "i need to change his end
// date and see what that means, has he overpaid … what he is due to be refunded if new tenant has moved in. Work out a
// logic that is safe for all tenancies").
//   preview: for every month the change touches — what was due, what is due now (the same part-month rule as the
//            monthly charges, lib/rentCharges/generate), what was received, what has already gone to the landlord —
//            so it shows any overpayment, how much of it can be refunded from the client account, and how much is
//            already with the landlord (to recover from them). It also checks the room: the end date can't run into
//            the next tenant's start.
//   apply:   saves the end date and puts each touched month's charge to its new amount, every change logged with the
//            before and after. Money never moves on its own: a refund is then recorded on the Money tab.
import type { SupabaseClient } from '@supabase/supabase-js'
import { rentDueForMonth } from '@/lib/rentCharges/generate'
import { importedChargeIds } from '@/lib/finance/importedCharges'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const monthOf = (d: string) => `${d.slice(0, 7)}-01`
const addMonths = (m: string, n: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 10)

export interface EndDateMonth { month: string; chargeId: string | null; dueBefore: number; dueAfter: number; note: string | null; received: number; remitted: number; over: number; refundable: number; withLandlord: number; stillOwed: number }
export interface EndDatePreview {
  tenancyId: string; tenant: string; from: string | null; to: string | null
  problems: string[]                  // the change can't be saved while any of these stand
  warnings: string[]
  nextTenant: { name: string; start: string } | null
  months: EndDateMonth[]
  totals: { over: number; refundable: number; withLandlord: number; stillOwed: number; dueChange: number }
}

export async function previewEndDate(s: SupabaseClient, tenancyId: string, newEnd: string | null): Promise<EndDatePreview | { error: string }> {
  if (newEnd !== null && !/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) return { error: 'Pick a real date.' }
  const { data: t } = await s.from('tenancies').select('id, room_id, property_id, start_date, end_date, rent_amount, rent_due_day, let_cancelled_at, people!person_id(salutation, first_name, last_name, full_name), properties(letting_type), rooms(is_let_only)').eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) return { error: 'Tenancy not found' }
  const who = (p: any) => [p?.salutation, p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || 'the tenant'
  const problems: string[] = [], warnings: string[] = []
  if (t.let_cancelled_at) problems.push('This let was cancelled.')
  if (newEnd && newEnd < t.start_date) problems.push(`The end date can’t be before the tenancy started (${t.start_date}).`)

  // the room: whoever comes next can't start before this tenancy ends
  const { data: others } = t.room_id ? await s.from('tenancies').select('id, start_date, end_date, let_cancelled_at, people!person_id(salutation, first_name, last_name, full_name)').eq('room_id', t.room_id).neq('id', t.id).is('let_cancelled_at', null) : { data: [] }
  const next = ((others ?? []) as any[]).filter(o => o.start_date > t.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null
  if (next && (!newEnd || newEnd >= next.start_date)) problems.push(`${who(next.people)} starts in this room on ${next.start_date}, so this tenancy must end by ${new Date(Date.parse(next.start_date) - 86_400_000).toISOString().slice(0, 10)}.`)

  const letOnly = t.properties?.letting_type === 'let_only' || !!t.rooms?.is_let_only
  const months: EndDateMonth[] = []
  if (!letOnly) {
    // every month either date touches: from the earlier end to the later one (open-ended: up to the last charge raised)
    const { data: ch } = await s.from('rent_charges').select('id, charge_month, amount_due, amount_received, remitted_amount, voided').eq('tenancy_id', t.id).eq('voided', false)
    const charges = (ch ?? []) as any[]
    const imported = await importedChargeIds(s, charges.map(c => c.id))
    const real = charges.filter(c => !imported.has(c.id))
    const lastCharge = real.map(c => c.charge_month).sort().pop() ?? null
    const ends = [t.end_date, newEnd].filter(Boolean) as string[]
    const fromMonth = monthOf(ends.length ? ends.sort()[0] : (lastCharge ?? t.start_date))
    const toMonth = [lastCharge, ...ends.map(monthOf)].filter(Boolean).sort().pop() as string
    for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) {
      const c = real.find(x => String(x.charge_month).slice(0, 10) === m)
      const before = c ? Number(c.amount_due) : (rentDueForMonth({ ...t, end_date: t.end_date }, m)?.amount ?? 0)
      const after = rentDueForMonth({ ...t, end_date: newEnd }, m)
      const dueAfter = after?.amount ?? 0
      const received = c ? Number(c.amount_received || 0) : 0, remitted = c ? Number(c.remitted_amount || 0) : 0
      const over = r2(Math.max(0, received - dueAfter))
      const refundable = r2(Math.min(over, Math.max(0, received - remitted)))
      if (!c && Math.abs(before - dueAfter) < 0.005 && !dueAfter) continue
      months.push({ month: m, chargeId: c?.id ?? null, dueBefore: r2(before), dueAfter: r2(dueAfter), note: after?.note ?? null, received: r2(received), remitted: r2(remitted), over, refundable, withLandlord: r2(over - refundable), stillOwed: r2(Math.max(0, dueAfter - received)) })
    }
    if (months.some(x => x.withLandlord > 0)) warnings.push('Some of the overpayment has already been paid to the landlord — it would need to come back from them (shown on their next statement).')
    if (months.some(x => !x.chargeId && x.dueAfter > 0)) warnings.push('Some months have no rent charge raised yet — they’re raised on the 1st (or from Rent charges), at the amount shown.')
    if (!(await import('@/lib/finance/mode')).CROS_COLLECTS_RENT) warnings.push('CROS is on statements only — “received” is only what has been recorded here. Rent collected in your other system won’t show, so check any refund there too.')
  } else warnings.push('Let only — the tenant pays the landlord, so there is no rent here to adjust.')

  const sum = (k: keyof EndDateMonth) => r2(months.reduce((n, x) => n + Number(x[k] || 0), 0))
  return {
    tenancyId: t.id, tenant: who(t.people), from: t.end_date ?? null, to: newEnd, problems, warnings,
    nextTenant: next ? { name: who(next.people), start: next.start_date } : null, months,
    totals: { over: sum('over'), refundable: sum('refundable'), withLandlord: sum('withLandlord'), stillOwed: sum('stillOwed'), dueChange: r2(sum('dueAfter') - sum('dueBefore')) },
  }
}

export async function applyEndDate(s: SupabaseClient, tenancyId: string, newEnd: string | null, reason: string, by: { personId: string; email: string }) {
  if (!reason.trim()) return { error: 'Say why the end date is changing — it stays on the record.' }
  const p = await previewEndDate(s, tenancyId, newEnd)
  if ('error' in p) return p
  if (p.problems.length) return { error: p.problems.join(' ') }
  const { error } = await s.from('tenancies').update({ end_date: newEnd }).eq('id', tenancyId)
  if (error) return { error: error.message }
  const now = new Date().toISOString()
  for (const m of p.months.filter(x => x.chargeId && Math.abs(x.dueAfter - x.dueBefore) > 0.005)) {
    const status = m.received <= 0 ? (m.dueAfter <= 0 ? 'waived' : 'pending') : m.received + 0.005 >= m.dueAfter ? 'paid' : 'partial'
    await s.from('rent_charges').update({ amount_due: m.dueAfter, amount_due_note: m.note ?? (m.dueAfter <= 0 ? 'Tenancy ended before this month' : null), amount_due_changed_at: now, amount_due_changed_by: by.personId, status }).eq('id', m.chargeId!)
    await s.from('payment_audit_log').insert({ rent_charge_id: m.chargeId, action: 'end_date_changed', performed_by: by.personId, performed_at: now, old_value: { amount_due: m.dueBefore }, new_value: { amount_due: m.dueAfter, end_date: newEnd }, note: reason.trim() })
  }
  await logTenancyEvent(s, tenancyId, 'end_date', `End date ${p.from ?? 'none'} → ${newEnd ?? 'none'}: ${reason.trim()}${p.totals.over > 0 ? ` · overpaid £${p.totals.over.toFixed(2)} (£${p.totals.refundable.toFixed(2)} refundable now${p.totals.withLandlord > 0 ? `, £${p.totals.withLandlord.toFixed(2)} already with the landlord` : ''})` : ''}`, by.email)
  return { ok: true, ...p }
}
