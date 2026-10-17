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

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const roomOf = (d: string) => { const m = d.match(/\bRoom\s*(\d+)\b/i) || d.match(/#(\d+)\b/); return m ? parseInt(m[1], 10) : null }
const words = (v: string) => String(v ?? '').toLowerCase().replace(/^(mr|mrs|miss|ms|dr|mx)\.?\s+/, '').split(/[^a-z]+/).filter(w => w.length > 1)

async function plan(s: ReturnType<typeof createServiceClient>) {
  const { data: lines } = await s.from('statement_line_items').select('id, statement_id, category, description, amount')
  const { data: rows } = await s.from('landlord_statement_rooms').select('id, statement_id, room_number, tenant_name, rent_income, management_fee, letting_fee, other_deductions, net_to_landlord')
  const recat: { id: string; to: string }[] = []
  const byStmt = new Map<string, any[]>()
  for (const l of (lines ?? []) as any[]) {
    const d = String(l.description ?? '')
    const to = /\bmanagement\s+fee\b/i.test(d) ? 'management_fee' : /\bletting\s+fee\b/i.test(d) ? 'letting_fee' : null
    if (to && l.category !== to) { recat.push({ id: l.id, to }); l.category = to }
    byStmt.set(l.statement_id, [...(byStmt.get(l.statement_id) ?? []), l])
  }
  const rowFix: { id: string; management_fee: number; letting_fee: number; net_to_landlord: number }[] = []
  const stmts = new Set<string>()
  for (const r of (rows ?? []) as any[]) {
    const ls = byStmt.get(r.statement_id) ?? []
    const tw = words(r.tenant_name)
    const mine = (l: any) => roomOf(String(l.description)) === Number(r.room_number) &&
      (!tw.length || words(String(l.description)).some(w => tw.includes(w)))
    const fee = (cat: string) => r2(ls.filter(l => l.category === cat && mine(l)).reduce((t, l) => t + Number(l.amount || 0), 0))
    const mgmt = fee('management_fee'), letting = fee('letting_fee')
    // only fill in a fee the statement actually shows for that room — never wipe one that's already set
    const nextM = mgmt > 0 ? mgmt : Number(r.management_fee || 0), nextL = letting > 0 ? letting : Number(r.letting_fee || 0)
    const net = r2(Number(r.rent_income || 0) - nextM - nextL - Number(r.other_deductions || 0))
    if (Math.abs(nextM - Number(r.management_fee || 0)) > 0.005 || Math.abs(nextL - Number(r.letting_fee || 0)) > 0.005 || Math.abs(net - Number(r.net_to_landlord || 0)) > 0.005) {
      rowFix.push({ id: r.id, management_fee: nextM, letting_fee: nextL, net_to_landlord: net }); stmts.add(r.statement_id)
    }
  }
  for (const x of recat) { const l = (lines ?? []).find((y: any) => y.id === x.id) as any; if (l) stmts.add(l.statement_id) }
  return { recat, rowFix, stmts: [...stmts], byStmt }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = await plan(createServiceClient())
  return NextResponse.json({ lines: p.recat.length, rooms: p.rowFix.length, statements: p.stmts.length })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const p = await plan(s)
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
  return NextResponse.json({ ok: true, lines: p.recat.length, rooms: p.rowFix.length, statements: p.stmts.length })
}
