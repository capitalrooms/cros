// POST /api/admin/statements/create { propertyId, month: 'YYYY-MM', holdExpenseIds?: string[], holdLettingFeeIds?: string[], skipFloatTopUp?: boolean }
// Makes the landlord statement for rent received and not yet paid over. Everything is worked out again here from the
// records (the page only says what to hold back to a later statement), then cros_create_statement (migration 193)
// re-checks each figure, numbers it (LS…) and marks the rent, expenses and letting fees as used — all in one go.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { buildStatementDraft } from '@/lib/statements/draft'
import { planFloat } from '@/lib/statements/float'

export const dynamic = 'force-dynamic'
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.propertyId || !/^\d{4}-\d{2}$/.test(b.month || '')) return NextResponse.json({ error: 'Choose the property and month' }, { status: 400 })
  const s = createServiceClient()
  let d
  try { d = await buildStatementDraft(s, b.propertyId, b.month) } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not prepare the statement' }, { status: 400 }) }

  if (!d.landlordId) return NextResponse.json({ error: 'This property has no landlord — add one before making a statement.' }, { status: 409 })
  if (d.feeWarnings.length) return NextResponse.json({ error: d.feeWarnings.join('. ') }, { status: 409 })
  const hold = new Set<string>(Array.isArray(b.holdExpenseIds) ? b.holdExpenseIds : [])
  const holdLet = new Set<string>(Array.isArray(b.holdLettingFeeIds) ? b.holdLettingFeeIds : [])
  const expenses = d.expenses.filter(e => !hold.has(e.id))
  const lettingFees = d.lettingFees.filter(l => !holdLet.has(l.tenancyId))
  if (!d.rooms.length && !expenses.length && !lettingFees.length) return NextResponse.json({ error: 'Nothing to put on a statement — no rent received that hasn’t been paid over, and no expenses or fees due.' }, { status: 409 })

  // room lines: rent and management fee per room, with any letting fee on the room it belongs to
  const rooms = d.rooms.map(r => ({ room_number: r.room_number, tenant_name: r.tenant_name, rent_income: r.rent, management_fee: r.fee, letting_fee: 0, note: r.note ?? null }))
  for (const l of lettingFees) {
    const line = rooms.find(r => r.room_number === l.roomNumber)
    if (line) { line.letting_fee = r2(line.letting_fee + l.amount); line.note = [line.note, `letting fee${l.number ? ' ' + l.number : ''}`].filter(Boolean).join('; ') }
    else rooms.push({ room_number: l.roomNumber, tenant_name: l.tenant, rent_income: 0, management_fee: 0, letting_fee: l.amount, note: `letting fee${l.number ? ' ' + l.number : ''} — tenancy from ${l.startDate}` })
  }
  const gross = r2(rooms.reduce((t, r) => t + r.rent_income, 0))
  const mgmt = r2(rooms.reduce((t, r) => t + r.management_fee, 0))
  const letting = r2(rooms.reduce((t, r) => t + r.letting_fee, 0))
  const exps = r2(expenses.reduce((t, e) => t + e.amount, 0))
  // the float: top it up towards its target, or use it when fees and expenses are more than the rent
  const fl = planFloat(r2(gross - mgmt - letting - exps), d.floatTarget, d.floatBalance, !!b.skipFloatTopUp)
  const net = fl.net
  if (fl.short > 0) return NextResponse.json({ error: `This statement would leave the landlord owing £${fl.short.toFixed(2)}${fl.used ? ` even after using the £${fl.used.toFixed(2)} float` : ''}. Untick some expenses to pay them next month, or invoice the landlord.` }, { status: 409 })

  const statementDate = /^\d{4}-\d{2}-\d{2}$/.test(b.statementDate || '') ? b.statementDate : new Date().toISOString().slice(0, 10)
  const { data, error } = await s.rpc('cros_create_statement', { p: {
    property_id: d.propertyId, landlord_id: d.landlordId, period_start: d.periodStart, period_end: d.periodEnd, statement_date: statementDate,
    management_fee_pct: d.feePct || null, created_by: admin.personId,
    rooms, expenses: expenses.map(e => ({ id: e.id, description: e.description, amount: e.amount, category: e.category ?? null, number: e.number ?? null, date: e.date ?? null, supplier: e.supplier ?? null })),
    charges: d.charges.filter(c => d.rooms.some(r => r.chargeIds.includes(c.id))).map(c => ({ id: c.id, remit_to: c.amount })),
    letting_fee_tenancies: lettingFees.map(l => l.tenancyId),
    gross_rent: gross, management_fees: mgmt, letting_fees: letting, property_charges: exps, net_to_landlord: net, float_retained: fl.retained, float_used: fl.used,
  } })
  if (error) return NextResponse.json({ error: error.message.replace(/^.*?: /, '') }, { status: 409 })
  return NextResponse.json({ ok: true, id: (data as any).id, reference: (data as any).statement_reference, net,
    message: `Made ${(data as any).statement_reference}: rent £${gross.toFixed(2)}, fees £${r2(mgmt + letting).toFixed(2)}, expenses £${exps.toFixed(2)}${fl.retained ? `, £${fl.retained.toFixed(2)} kept in the float` : ''}${fl.used ? `, £${fl.used.toFixed(2)} taken from the float` : ''} — £${net.toFixed(2)} to the landlord. Check it, then approve it for the payment run.` })
}
