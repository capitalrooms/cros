// Build a landlord statement for one property and month from what actually happened:
//   rent received (rent_charges) − management fee − expenses logged for the property (recharge_expenses).
// Nothing is written here; the admin checks the draft in the statements form and saves it.
//
// Rent is counted on what has been RECEIVED and not yet paid over (amount_received − remitted_amount),
// so late or part payments for earlier months carry onto the next statement. Until migration 185 adds
// remitted_amount, it falls back to the month's own charges.
import { nextStatementNumber } from '@/lib/statements/numbering'
import { resolveFee, feeAmount, describeFee } from '@/lib/fees/managementFee'
import { ledgerStart } from '@/lib/clientLedger'
import { planFloat } from '@/lib/statements/float'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DraftRoom { room_number: string; tenant_name: string; rent: number; fee: number; chargeIds: string[]; note?: string }
export interface DraftExpense { id: string; description: string; amount: number; date: string; number?: string | null; supplier?: string | null; hasInvoice?: boolean; shareInvoice?: boolean; category?: string | null }
export interface DraftLettingFee { tenancyId: string; roomNumber: string; tenant: string; amount: number; startDate: string; number?: string | null }
export interface Unpaid { room: string; tenant: string; month: string; due: number; received: number }
export interface StatementDraft {
  propertyId: string
  landlordId: string | null
  reference: string
  periodStart: string
  periodEnd: string
  statementDate: string
  feePct: number
  feeWarnings: string[]   // rooms with no management fee set (never assumed)
  rooms: DraftRoom[]
  expenses: DraftExpense[]
  floatTarget: number              // the property's float target (migration 195; 0 = no float)
  floatBalance: number             // what's in the float now
  lettingFees: DraftLettingFee[]   // letting fees not yet charged, for tenancies that started by the period end (from CROS's take-over)
  unpaid: Unpaid[]
  charges: { id: string; amount: number }[]   // what saving should mark as paid over (charge id → amount_received)
  tracksRemitted: boolean
  existingId: string | null
  totals: { gross: number; fees: number; lettingFees: number; expenses: number; floatRetained: number; floatUsed: number; net: number }
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const monthName = (iso: string, style: 'short' | 'long' = 'long') => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { month: style, timeZone: 'UTC' })
export const statementReference = (month: string) => new Date(month + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export async function buildStatementDraft(s: SupabaseClient, propertyId: string, month: string): Promise<StatementDraft> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be YYYY-MM')
  const start = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

  const { data: prop, error: pErr } = await s.from('properties').select('*').eq('id', propertyId).maybeSingle()
  if (pErr || !prop) throw new Error('Property not found')
  // the property's default fee; each room uses its tenancy's own fee if it has one (lib/fees/managementFee)
  const propFee = resolveFee(null, prop as any)
  const feePct = propFee.pct ?? 0

  const [{ data: rooms }, { data: tenancies }, { data: expenses }, existing] = await Promise.all([
    s.from('rooms').select('id, name').eq('property_id', propertyId),
    s.from('tenancies').select('*, people!person_id(first_name, last_name, full_name)')
      .eq('property_id', propertyId).lte('start_date', end).or(`end_date.is.null,end_date.gte.${start}`),
    // not yet on a statement; '*' so it works before and after migration 191 adds deduct_month
    s.from('recharge_expenses').select('*').eq('property_id', propertyId)
      .is('included_in_statement_id', null).order('expense_date'),
    // this property's statement for the month, if one exists (imported from 10ninety or made here)
    s.from('landlord_statements').select('id, statement_reference').eq('property_id', propertyId).gte('statement_date', start).lte('statement_date', end).order('statement_date').limit(1).maybeSingle(),
  ])
  // an existing statement keeps its number; a new one takes the next in the LS sequence
  const reference = (existing.data as any)?.statement_reference || await nextStatementNumber(s)

  // Charges: everything received but not yet paid over (needs migration 185), else this month's only.
  let tracksRemitted = true
  let charges: any[] = []
  const withRemitted = await s.from('rent_charges')
    .select('id, room_id, charge_month, amount_due, amount_received, status, voided, remitted_amount')
    .eq('property_id', propertyId).lte('charge_month', end)
  if (withRemitted.error) {
    tracksRemitted = false
    const plain = await s.from('rent_charges').select('id, room_id, charge_month, amount_due, amount_received, status, voided')
      .eq('property_id', propertyId).eq('charge_month', start)
    if (plain.error) throw new Error(plain.error.message)
    charges = plain.data ?? []
  } else charges = withRemitted.data ?? []
  charges = charges.filter(c => !c.voided)

  const roomName = new Map((rooms ?? []).map((r: any) => [r.id, r.name as string]))
  const tenancyFor = (roomId: string) => (tenancies ?? []).filter((x: any) => x.room_id === roomId).sort((a: any, b: any) => String(b.start_date).localeCompare(String(a.start_date)))[0] as any
  const chargedFor = new Map<string, number>()
  for (const c of charges) if (String(c.charge_month).slice(0, 10) === start) chargedFor.set(c.room_id, r2((chargedFor.get(c.room_id) ?? 0) + Number(c.amount_due || 0)))
  const tenantFor = (roomId: string) => {
    const t = (tenancies ?? []).filter((x: any) => x.room_id === roomId).sort((a: any, b: any) => String(b.start_date).localeCompare(String(a.start_date)))[0] as any
    const p = t?.people
    return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || ''
  }
  const roomNo = (name: string) => name.match(/\d+/)?.[0] ?? name

  const byRoom = new Map<string, DraftRoom>()
  const paidOver: { id: string; amount: number }[] = []
  const unpaid: Unpaid[] = []
  for (const c of charges) {
    const received = Number(c.amount_received || 0)
    const already = tracksRemitted ? Number(c.remitted_amount || 0) : 0
    const delta = r2(received - already)
    const name = roomName.get(c.room_id) || 'Room'
    const forMonth = String(c.charge_month).slice(0, 10)
    if (forMonth === start && received < Number(c.amount_due || 0)) {
      unpaid.push({ room: name, tenant: tenantFor(c.room_id), month: monthName(forMonth), due: Number(c.amount_due), received })
    }
    if (delta <= 0) continue
    const room: DraftRoom = byRoom.get(c.room_id) ?? { room_number: roomNo(name), tenant_name: tenantFor(c.room_id), rent: 0, fee: 0, chargeIds: [] }
    room.rent = r2(room.rent + delta)
    room.chargeIds.push(c.id)
    if (forMonth !== start) room.note = [room.note, `includes ${monthName(forMonth)} rent received late`].filter(Boolean).join('; ')
    byRoom.set(c.room_id, room)
    paidOver.push({ id: c.id, amount: received })
  }
  const roomIdOf = new Map([...byRoom.entries()].map(([id, r]) => [r, id]))
  const feeWarnings: string[] = []
  const draftRooms = [...byRoom.values()]
    .map(r => {
      const id = roomIdOf.get(r)!
      const fee = resolveFee(tenancyFor(id), prop as any)
      const amount = feeAmount(fee, { received: r.rent, charged: chargedFor.get(id) ?? r.rent })
      if (amount == null) feeWarnings.push(`Room ${r.room_number}: no management fee set — add it on the tenancy or the property`)
      return { ...r, fee: amount ?? 0, note: fee.source === 'tenancy' ? [r.note, `fee: ${describeFee(fee)}`].filter(Boolean).join('; ') : r.note }
    })
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
  // the invoice / expense reference goes on the statement line so the landlord can match it to the invoice
  // due on this statement: the month chosen for it (lib/expenses/period), else anything dated up to the month end
  const dueNow = ((expenses ?? []) as any[]).filter(e => !e.voided_at).filter(e => e.deduct_month ? String(e.deduct_month).slice(0, 10) <= start : String(e.expense_date) <= end)
  const draftExpenses: DraftExpense[] = dueNow.map((e: any) => ({
    id: e.id, description: (e.txn_no || e.reference) ? `${e.description} (${e.txn_no || e.reference})` : e.description, amount: Number(e.amount), date: e.expense_date,
    number: e.txn_no ?? e.reference ?? null, supplier: e.supplier ?? null, hasInvoice: !!e.invoice_path, shareInvoice: !!e.share_invoice, category: e.category ?? null,
  }))

  // Letting fees: charged once, on the first statement after the tenancy starts. Tenancies that began before CROS
  // took over collecting (the ledger start) were charged on the previous agent's statements.
  const takeover = await ledgerStart(s)
  const lettingFees: DraftLettingFee[] = ((tenancies ?? []) as any[])
    .filter(t => Number(t.letting_fee_charged) > 0 && !t.letting_fee_statement_id && t.start_date && t.start_date >= takeover && t.start_date <= end)
    .map(t => ({
      tenancyId: t.id, roomNumber: roomNo(roomName.get(t.room_id) || 'Room'), amount: r2(Number(t.letting_fee_charged)), startDate: t.start_date, number: t.letting_fee_no ?? null,
      tenant: [t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ') || t.people?.full_name || '',
    }))

  const gross = r2(draftRooms.reduce((t, r) => t + r.rent, 0))
  const fees = r2(draftRooms.reduce((t, r) => t + r.fee, 0))
  const letting = r2(lettingFees.reduce((t, l) => t + l.amount, 0))
  const exp = r2(draftExpenses.reduce((t, e) => t + e.amount, 0))
  // the float held for the property: retained less used on its statements
  const { data: floatRows } = await s.from('landlord_statements').select('*').eq('property_id', propertyId)
  const floatBalance = r2(((floatRows ?? []) as any[]).reduce((t, x) => t + Number(x.float_retained || 0) - Number(x.float_used || 0), 0))
  const floatTarget = r2(Number((prop as any).float_target || 0))
  const plan = planFloat(r2(gross - fees - letting - exp), floatTarget, floatBalance)
  return {
    propertyId, landlordId: prop.landlord_id ?? null,
    reference, periodStart: start, periodEnd: end, statementDate: end,
    feePct, feeWarnings, rooms: draftRooms, expenses: draftExpenses, lettingFees, floatTarget, floatBalance, unpaid, charges: paidOver, tracksRemitted,
    existingId: existing.data?.id ?? null,
    totals: { gross, fees, lettingFees: letting, expenses: exp, floatRetained: plan.retained, floatUsed: plan.used, net: plan.net },
  }
}
