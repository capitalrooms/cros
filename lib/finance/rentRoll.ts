// The rent roll for one month: every room's rent, what has arrived (date, receipt number, bank file), what is
// missing, and — per property — the rent received and not yet paid over to the landlord (exactly what the next
// statement will take, lib/statements/draft). Months before CROS took over collecting come from the statements
// imported from the previous agent, so history still shows (marked as collected by them).
import type { SupabaseClient } from '@supabase/supabase-js'
import { importedRentFor } from '@/lib/finance/importedRent'
import { statementMonth } from '@/lib/finance/statementMonth'
const shiftDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
import { ledgerStart } from '@/lib/clientLedger'
import { demoPropertyIds, inScope } from '@/lib/demoProperties'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

export type RoomStatus = 'paid' | 'part' | 'missing' | 'over' | 'no_charge' | 'collected_by_previous_agent'
export interface Receipt { number: string | null; date: string | null; amount: number; file: string | null; how: 'bank' | 'by hand' }
export interface RollRoom {
  roomId: string | null; room: string; tenant: string; tenancyId: string | null; reference: string | null; chargeId: string | null; chargeNo: string | null
  due: number | null; received: number; difference: number | null; status: RoomStatus; receipts: Receipt[]
  paidOver: number; statement: string | null
}
export interface RollStatement { id: string; reference: string; date: string; net: number; state: 'draft' | 'approved' | 'paid'; source: string }
export interface RollProperty {
  id: string; name: string; code: string | null; landlord: string
  rooms: RollRoom[]
  due: number; received: number; missing: number
  readyForStatement: number            // rent received (any month up to this one) and not yet paid over
  statements: RollStatement[]
}
export interface RentRoll { month: string; source: 'cros' | 'previous_agent'; takeover: string; properties: RollProperty[]; totals: { due: number; received: number; missing: number; ready: number } }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const first = (s: unknown) => String(s || '').split('\n')[0]
const who = (p: any) => (p ? [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || '' : '')
const stateOf = (st: any): RollStatement['state'] => (st.paid_date ? 'paid' : st.approved_at ? 'approved' : 'draft')

export async function buildRentRoll(s: SupabaseClient, month: string, opts: { practice?: boolean } = {}): Promise<RentRoll> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be YYYY-MM')
  const start = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const takeover = await ledgerStart(s)
  const demo = await demoPropertyIds(s)

  const [props, rooms, tens, statements] = await Promise.all([
    s.from('properties').select('id, name, property_code, landlord_id, letting_type, property_type').or('letting_type.is.null,letting_type.neq.let_only'),
    s.from('rooms').select('id, name, property_id'),
    s.from('tenancies').select('id, room_id, property_id, start_date, end_date, payment_reference, people!person_id(salutation, first_name, last_name, full_name)')
      .lte('start_date', end).or(`end_date.is.null,end_date.gte.${start}`).is('let_cancelled_at', null),
    // a window either side: a statement belongs to its own month (lib/finance/statementMonth), which needn't be the month of its date
    s.from('landlord_statements').select('*').gte('statement_date', shiftDays(start, -45)).lte('statement_date', shiftDays(end, 45)).order('statement_date'),
  ])
  const whole = (p: any) => p.property_type === 'single_let'   // a single let is never "Room 1"
  const monthStatements = ((statements.data ?? []) as any[]).filter(st => statementMonth(st) === month)
  const properties = sortPropertiesNumerically(((props.data ?? []) as any[]).filter(p => inScope(demo, !!opts.practice)(p.id)))
  const landlordIds = [...new Set(properties.map(p => p.landlord_id).filter(Boolean))]
  const { data: landlords } = landlordIds.length ? await s.from('people').select('id, salutation, first_name, last_name, full_name, company').in('id', landlordIds) : { data: [] as any[] }
  const landlordName = new Map(((landlords ?? []) as any[]).map(p => [p.id, p.company || who(p)]))
  const roomName = new Map(((rooms.data ?? []) as any[]).map(r => [r.id, r.name as string]))
  const roomsOf = (pid: string) => ((rooms.data ?? []) as any[]).filter(r => r.property_id === pid)
  const tenancyFor = (roomId: string) => ((tens.data ?? []) as any[]).filter(t => t.room_id === roomId).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0] ?? null
  const stmtsFor = (pid: string) => monthStatements.filter(st => st.property_id === pid)
    .map(st => ({ id: st.id, reference: st.statement_reference, date: st.statement_date, net: Number(st.net_to_landlord || 0), state: stateOf(st), source: st.source ?? 'import' }))

  // ── Before CROS collected rent: what the previous agent's statements show ──
  if (start < takeover) {
    const out: RollProperty[] = []
    // statements emailed in (statements@) keep rent as lines, not a room table — each line in the month it's for
    const imported = await importedRentFor(s, month)
    const importedRefs = new Map<string, string>()
    if (imported.length) {
      const { data: refs } = await s.from('landlord_statements').select('id, statement_reference').in('id', [...new Set(imported.map(l => l.statementId))])
      for (const r of (refs ?? []) as any[]) importedRefs.set(r.id, r.statement_reference)
    }
    for (const p of properties) {
      const sts = monthStatements.filter(st => st.property_id === p.id)
      const lines = sts.flatMap(st => (Array.isArray(st.rooms) ? st.rooms : []).map((r: any) => ({ r, st })))
      const fromLines: RollRoom[] = imported.filter(l => l.propertyId === p.id).map((l): RollRoom => ({
        roomId: null, room: whole(p) ? 'Whole property' : l.room ? `Room ${l.room}` : 'Rent', tenant: l.tenant, tenancyId: null, reference: null, chargeId: null, chargeNo: null,
        due: null, received: l.amount, difference: null, status: 'collected_by_previous_agent' as RoomStatus, receipts: [] as Receipt[],
        paidOver: l.amount, statement: importedRefs.get(l.statementId) ?? '',
      }))
      const rollRooms: RollRoom[] = [...fromLines, ...lines.map(({ r, st }): RollRoom => ({
        roomId: null, room: whole(p) ? 'Whole property' : `Room ${r.room_number ?? ''}`.trim(), tenant: /^room\s*\d+$/i.test(String(r.tenant_name ?? '').trim()) ? '' : r.tenant_name || '', tenancyId: null, reference: null, chargeId: null, chargeNo: null,
        due: null, received: r2(Number(r.rent_income || 0)), difference: null, status: 'collected_by_previous_agent' as RoomStatus, receipts: [] as Receipt[],
        paidOver: r2(Number(r.rent_income || 0)), statement: st.statement_reference,
      }))].sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
      if (!rollRooms.length && !roomsOf(p.id).some(r => tenancyFor(r.id))) continue
      const received = r2(rollRooms.reduce((t, r) => t + r.received, 0))
      out.push({ id: p.id, name: first(p.name), code: p.property_code, landlord: landlordName.get(p.landlord_id) || '', rooms: rollRooms,
        due: received, received, missing: 0, readyForStatement: 0, statements: stmtsFor(p.id) })
    }
    return { month, source: 'previous_agent', takeover, properties: out, totals: sum(out) }
  }

  // ── CROS months: the rent charges, their receipts and what's been paid over ──
  const propIds = properties.map(p => p.id)
  const [monthCharges, openCharges] = await Promise.all([
    s.from('rent_charges').select('*').eq('charge_month', start).in('property_id', propIds),
    // everything received and not yet paid over, up to this month — what the next statement takes
    s.from('rent_charges').select('property_id, amount_received, remitted_amount, voided').lte('charge_month', end).gte('charge_month', takeover).in('property_id', propIds).gt('amount_received', 0),
  ])
  const charges = ((monthCharges.data ?? []) as any[]).filter(c => !c.voided)
  const chargeIds = charges.map(c => c.id)
  const { data: audit } = chargeIds.length
    ? await s.from('payment_audit_log').select('rent_charge_id, action, performed_at, new_value, bank_transaction_id').in('rent_charge_id', chargeIds).in('action', ['csv_matched', 'manual_allocated', 'fuzzy_confirmed', 'manually_paid']).order('performed_at')
    : { data: [] as any[] }
  const txnIds = [...new Set(((audit ?? []) as any[]).map(a => a.bank_transaction_id).filter(Boolean))]
  const { data: txns } = txnIds.length ? await s.from('bank_transactions').select('id, txn_no, transaction_date, amount, batch_id').in('id', txnIds) : { data: [] as any[] }
  const batchIds = [...new Set(((txns ?? []) as any[]).map(t => t.batch_id).filter(Boolean))]
  const { data: batches } = batchIds.length ? await s.from('bank_import_batches').select('id, filename').in('id', batchIds) : { data: [] as any[] }
  const txnById = new Map(((txns ?? []) as any[]).map(t => [t.id, t]))
  const fileById = new Map(((batches ?? []) as any[]).map(b => [b.id, b.filename]))
  const receiptsFor = (chargeId: string): Receipt[] => ((audit ?? []) as any[]).filter(a => a.rent_charge_id === chargeId).map(a => {
    const t = a.bank_transaction_id ? txnById.get(a.bank_transaction_id) : null
    const amount = Number(a.new_value?.this_payment ?? a.new_value?.amount_received ?? t?.amount ?? 0)
    return { number: t?.txn_no ?? null, date: t?.transaction_date ?? (a.performed_at ? String(a.performed_at).slice(0, 10) : null), amount: r2(amount), file: t ? fileById.get(t.batch_id) ?? null : null, how: t ? 'bank' : 'by hand' }
  })
  const ready = new Map<string, number>()
  for (const c of ((openCharges.data ?? []) as any[])) if (!c.voided) ready.set(c.property_id, r2((ready.get(c.property_id) ?? 0) + Math.max(0, Number(c.amount_received || 0) - Number(c.remitted_amount || 0))))
  const { data: remittedSts } = await s.from('landlord_statements').select('id, statement_reference').in('id', [...new Set(charges.map(c => c.remitted_statement_id).filter(Boolean))].concat(['00000000-0000-0000-0000-000000000000']))
  const stRef = new Map(((remittedSts ?? []) as any[]).map(x => [x.id, x.statement_reference]))

  const out: RollProperty[] = []
  for (const p of properties) {
    const rollRooms: RollRoom[] = []
    for (const room of roomsOf(p.id)) {
      // one row per tenancy (migration 217): in a changeover month the outgoing and incoming tenants each have
      // their own rent. A charge with no tenancy (made before 217) is the room's, shown with whoever had the room.
      const roomTens = ((tens.data ?? []) as any[]).filter(t => t.room_id === room.id).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
      const roomCharges = charges.filter(x => x.room_id === room.id)
      if (!roomTens.length && !roomCharges.length) continue      // empty room, nothing due
      const used = new Set<string>()
      const pairs: { t: any; c: any }[] = roomTens.map(t => {
        const c = roomCharges.find(x => x.tenancy_id === t.id) ?? (roomTens.length === 1 ? roomCharges.find(x => !x.tenancy_id) : undefined)
        if (c) used.add(c.id)
        return { t, c }
      })
      for (const c of roomCharges) if (!used.has(c.id)) pairs.push({ t: roomTens.find(t => t.id === c.tenancy_id) ?? null, c })
      for (const { t, c } of pairs) {
        const tenant = who(t?.people)
        if (!c) {
          rollRooms.push({ roomId: room.id, room: room.name, tenant, tenancyId: t?.id ?? null, reference: t?.payment_reference ?? null, chargeId: null, chargeNo: null,
            due: null, received: 0, difference: null, status: 'no_charge', receipts: [], paidOver: 0, statement: null })
          continue
        }
        const due = r2(Number(c.amount_due || 0)), received = r2(Number(c.amount_received || 0)), diff = r2(received - due)
        const status: RoomStatus = received <= 0 ? 'missing' : Math.abs(diff) < 0.005 ? 'paid' : diff < 0 ? 'part' : 'over'
        rollRooms.push({ roomId: room.id, room: room.name, tenant, tenancyId: t?.id ?? null, reference: t?.payment_reference ?? c.reference ?? null, chargeId: c.id, chargeNo: c.txn_no ?? null,
          due, received, difference: diff, status, receipts: receiptsFor(c.id), paidOver: r2(Number(c.remitted_amount || 0)), statement: c.remitted_statement_id ? stRef.get(c.remitted_statement_id) ?? null : null })
      }
    }
    if (!rollRooms.length) continue
    rollRooms.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }))
    const due = r2(rollRooms.reduce((t, r) => t + (r.due ?? 0), 0)), received = r2(rollRooms.reduce((t, r) => t + r.received, 0))
    out.push({ id: p.id, name: first(p.name), code: p.property_code, landlord: landlordName.get(p.landlord_id) || '', rooms: rollRooms,
      due, received, missing: r2(rollRooms.reduce((t, r) => t + Math.max(0, (r.due ?? 0) - r.received), 0)), readyForStatement: ready.get(p.id) ?? 0, statements: stmtsFor(p.id) })
  }
  return { month, source: 'cros', takeover, properties: out, totals: sum(out) }
}

function sum(ps: RollProperty[]) {
  return {
    due: r2(ps.reduce((t, p) => t + p.due, 0)), received: r2(ps.reduce((t, p) => t + p.received, 0)),
    missing: r2(ps.reduce((t, p) => t + p.missing, 0)), ready: r2(ps.reduce((t, p) => t + p.readyForStatement, 0)),
  }
}
