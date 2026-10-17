// POST /api/admin/reconciliation/fees — match each room's management and letting fee from its statement's own lines
// (17 Oct 2026, Harry: "it shows the rent but no management fee — surely it sees in the statements what the
// corresponding management fee is"). On some imported statements the agent's "Room 1 Management Fee (10%) - Mr Joel
// Sutton" lines were filed as room maintenance, so the room rows showed £0 fee and the full rent as net.
//   1. a line that says "Management Fee" / "Letting Fee" is filed as that (it was a guess before)
//   2. each room row's fee = the fee lines naming that room (and tenant); net = rent − fees − other deductions
//   3. the statement's totals are worked out again from its lines (management and letting fees kept apart)
// GET → how many rows / lines would change (nothing is changed). Safe to run again.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { planFeeMatch as plan } from '@/lib/finance/matchFees'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = await plan(createServiceClient() as any)
  return NextResponse.json({ lines: p.recat.length, rooms: p.rowFix.length, statements: p.stmts.length, held: p.held.length })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const p = await plan(s as any)
  for (const x of p.recat) await s.from('statement_line_items').update({ category: x.to }).eq('id', x.id)
  for (const r of p.rowFix) await s.from('landlord_statement_rooms').update({ management_fee: r.management_fee, letting_fee: r.letting_fee, net_to_landlord: r.net_to_landlord }).eq('id', r.id)
  // statement totals from its lines — the same sums as the import (AutoLedger)
  for (const id of p.stmts) {
    let gross = 0, fees = 0, charges = 0, letting = 0
    for (const l of p.byStmt.get(id) ?? []) {
      const a = Number(l.amount || 0)
      if (l.category === 'rent_income') gross += a
      else if (l.category === 'management_fee') fees += a
      else if (l.category === 'letting_fee') letting += a
      else charges += a
    }
    // management and letting fees kept apart, as on CROS's own statements (the approve check and the client ledger
    // take each off once — the import used to fold letting fees into management fees; the totals don't change)
    await s.from('landlord_statements').update({ gross_rent: r2(gross), management_fees: r2(fees), letting_fees: r2(letting), property_charges: r2(charges), net_to_landlord: r2(gross - fees - letting - charges) }).eq('id', id)
  }
  return NextResponse.json({ ok: true, lines: p.recat.length, rooms: p.rowFix.length, statements: p.stmts.length, held: p.held.length })
}
