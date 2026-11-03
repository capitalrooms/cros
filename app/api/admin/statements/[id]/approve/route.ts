// POST /api/admin/statements/[id]/approve { approve: boolean }
// Approve = the figures are checked and locked, and the statement is ready for the payment run.
// Un-approving is allowed only until it is paid (the database refuses after that) — every change is audited.
import { NextRequest, NextResponse } from 'next/server'
import { importedChargeIds } from '@/lib/finance/importedCharges'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: st } = await s.from('landlord_statements').select('id, statement_reference, source, gross_rent, management_fees, letting_fees, property_charges, net_to_landlord, paid_date, approved_at').eq('id', id).maybeSingle()
  if (!st) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  if (b.approve) {
    const off = Math.round((Number(st.gross_rent) - Number(st.management_fees) - Number(st.letting_fees || 0) - Number(st.property_charges) - Number(st.net_to_landlord)) * 100)
    if (off !== 0) return NextResponse.json({ error: `${st.statement_reference} doesn’t balance, so it can’t be approved.` }, { status: 409 })
    // an imported statement is the previous agent's record — nothing of ours to approve or pay (3 Nov 2026 audit)
    if ((st as any).source === 'import') return NextResponse.json({ error: `${st.statement_reference} was imported from the previous agent — it’s a record only, not something CROS pays.` }, { status: 409 })
    // the rent on it must be rent we actually received: its rooms' charges, never one from an imported statement
    const { data: rooms } = await s.from('landlord_statement_rooms').select('rent_charge_id, rejected').eq('statement_id', id)
    const chargeIds = [...new Set(((rooms ?? []) as any[]).filter(r => !r.rejected && r.rent_charge_id).map(r => r.rent_charge_id as string))]
    const imported = await importedChargeIds(s, chargeIds)
    const { data: charges } = chargeIds.length ? await s.from('rent_charges').select('id, amount_received, voided').in('id', chargeIds) : { data: [] }
    const received = Math.round(((charges ?? []) as any[]).filter(c => !c.voided && !imported.has(c.id)).reduce((n, c) => n + Number(c.amount_received || 0), 0) * 100) / 100
    if (Number(st.gross_rent) > received + 0.005)
      return NextResponse.json({ error: `${st.statement_reference} shows £${Number(st.gross_rent).toFixed(2)} rent, but only £${received.toFixed(2)} has been received for its rooms — it can’t be approved until the rent is in.` }, { status: 409 })
    const { error } = await s.from('landlord_statements').update({ approved_at: new Date().toISOString(), approved_by: admin.personId }).eq('id', id).is('approved_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: `${st.statement_reference} approved — it’s now in the payment run.` })
  }
  if (st.paid_date) return NextResponse.json({ error: 'It has been paid, so it can’t be un-approved.' }, { status: 409 })
  const { error } = await s.from('landlord_statements').update({ approved_at: null, approved_by: null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, message: `${st.statement_reference} is back to draft.` })
}
